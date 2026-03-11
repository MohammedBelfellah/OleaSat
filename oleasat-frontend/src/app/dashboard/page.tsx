 "use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

import styles from "./page.module.css";
import {
  ApiError,
  authMe,
  fetchTelegramLink,
  fetchTelegramLinkMe,
  fetchFeedbackSummary,
  fetchFarmDetail,
  fetchFarms,
  fetchMetricsSummary,
  sendAdminTelegramUpdate,
  submitFeedback,
  type FeedbackType,
  type FeedbackSummaryResponse,
  type FarmDetailResponse,
  type FarmListItem,
  type MetricsSummaryResponse,
  registerFarm,
  type RegisterFarmRequest,
  type SoilType,
  type TelegramOwnerLinkResponse,
  type TreeAge,
  type UserOut,
} from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth";

const ParcelDrawMap = dynamic(() => import("@/components/maps/ParcelDrawMap"), {
  ssr: false,
  loading: () => <div className={styles.muted}>Loading map tools...</div>,
});

type RightView = "actions" | "farms" | "telegram" | "feedback" | "profile";
type FarmPanelView = "list" | "add";
type AddFarmStep = 1 | 2;
type PolygonMode = "map" | "text";

const SAMPLE_POLYGON: number[][] = [
  [-5.58, 35.78],
  [-5.53, 35.79],
  [-5.5, 35.75],
  [-5.56, 35.73],
];

const FEEDBACK_TYPES: FeedbackType[] = ["WORKED", "TOO_MUCH", "TOO_LITTLE", "NOT_APPLIED"];

function toError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.detail === "Invalid or expired token") {
      return "Session expired. Please login again.";
    }
    return `${error.detail} (HTTP ${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected dashboard error";
}

function isAbortRequestError(error: unknown): boolean {
  if (error instanceof DOMException && error.name === "AbortError") {
    return true;
  }
  if (error instanceof Error) {
    return error.message.toLowerCase().includes("aborted");
  }
  return false;
}

function fmt(value: number, digits = 1): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function prettyPolygon(points: number[][]): string {
  return JSON.stringify(points, null, 2);
}

function parsePolygonText(raw: string): number[][] {
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed) || parsed.length < 3) {
    throw new Error("Polygon must be an array with at least 3 points.");
  }

  return parsed.map((point) => {
    if (!Array.isArray(point) || point.length < 2) {
      throw new Error("Each polygon point must be [longitude, latitude].");
    }

    const lon = Number(point[0]);
    const lat = Number(point[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) {
      throw new Error("Polygon coordinates must be valid numbers.");
    }

    return [lon, lat];
  });
}

export default function DashboardPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [view, setView] = useState<RightView>("actions");
  const [farmPanelView, setFarmPanelView] = useState<FarmPanelView>("list");
  const [selectedFarmId, setSelectedFarmId] = useState("");
  const [feedbackFarmId, setFeedbackFarmId] = useState("");

  const [loadingBase, setLoadingBase] = useState(true);
  const [baseError, setBaseError] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsSummaryResponse | null>(null);
  const [farms, setFarms] = useState<FarmListItem[]>([]);
  const [farmDetails, setFarmDetails] = useState<FarmDetailResponse[]>([]);

  const [addFarmStep, setAddFarmStep] = useState<AddFarmStep>(1);
  const [polygonMode, setPolygonMode] = useState<PolygonMode>("map");

  const [farmerName, setFarmerName] = useState("Oliveira Nord");
  const [phone, setPhone] = useState("+212600000000");
  const [cropType, setCropType] = useState("olive");
  const [treeAge, setTreeAge] = useState<TreeAge>("ADULT");
  const [soilType, setSoilType] = useState<SoilType>("MEDIUM");
  const [treeCount, setTreeCount] = useState("120");
  const [spacingM2, setSpacingM2] = useState("100");
  const [efficiency, setEfficiency] = useState("0.9");
  const [polygonPoints, setPolygonPoints] = useState<number[][]>(SAMPLE_POLYGON);
  const [polygonText, setPolygonText] = useState(prettyPolygon(SAMPLE_POLYGON));

  const [registeringFarm, setRegisteringFarm] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);
  const [registerSuccess, setRegisterSuccess] = useState<string | null>(null);

  const [feedbackLoading, setFeedbackLoading] = useState(false);
  const [feedbackError, setFeedbackError] = useState<string | null>(null);
  const [feedbackSummary, setFeedbackSummary] = useState<FeedbackSummaryResponse | null>(null);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("WORKED");
  const [feedbackRating, setFeedbackRating] = useState("5");
  const [feedbackComment, setFeedbackComment] = useState("");
  const [feedbackSubmitting, setFeedbackSubmitting] = useState(false);
  const [feedbackSubmitMessage, setFeedbackSubmitMessage] = useState<string | null>(null);

  const [telegramLinkLoading, setTelegramLinkLoading] = useState(false);
  const [telegramLinkError, setTelegramLinkError] = useState<string | null>(null);
  const [telegramLinkData, setTelegramLinkData] = useState<TelegramOwnerLinkResponse | null>(null);
  const [telegramOpenMessage, setTelegramOpenMessage] = useState<string | null>(null);

  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profile, setProfile] = useState<UserOut | null>(null);
  const [telegramMessage, setTelegramMessage] = useState("");
  const [telegramSending, setTelegramSending] = useState(false);
  const [telegramError, setTelegramError] = useState<string | null>(null);
  const [telegramSuccess, setTelegramSuccess] = useState<string | null>(null);

  const loadBase = useCallback(async (signal?: AbortSignal) => {
    setLoadingBase(true);
    setBaseError(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const [summary, list, me] = await Promise.all([
        fetchMetricsSummary(token, signal),
        fetchFarms(token, signal),
        authMe(token, signal),
      ]);

      const details = await Promise.all(
        list.map(async (farm) => {
          try {
            return await fetchFarmDetail(token, farm.id, signal);
          } catch {
            return { farm, last_alert: null } as FarmDetailResponse;
          }
        }),
      );

      setMetrics(summary);
      setFarms(list);
      setFarmDetails(details);
      setProfile(me);
      setSelectedFarmId((prev) => prev || list[0]?.id || "");
      setFeedbackFarmId((prev) => prev || list[0]?.id || "");
    } catch (error) {
      if (isAbortRequestError(error)) {
        return;
      }
      setBaseError(toError(error));
    } finally {
      setLoadingBase(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadBase(controller.signal);
    return () => controller.abort();
  }, [loadBase]);

  useEffect(() => {
    const nextView = searchParams.get("view");
    if (
      nextView === "actions" ||
      nextView === "farms" ||
      nextView === "telegram" ||
      nextView === "feedback" ||
      nextView === "profile"
    ) {
      setView(nextView);
    }
  }, [searchParams]);

  useEffect(() => {
    if (!selectedFarmId && farms[0]?.id) {
      setSelectedFarmId(farms[0].id);
      return;
    }

    if (selectedFarmId && !farms.find((farm) => farm.id === selectedFarmId)) {
      setSelectedFarmId(farms[0]?.id || "");
    }
  }, [selectedFarmId, farms]);

  useEffect(() => {
    if (!feedbackFarmId && farms[0]?.id) {
      setFeedbackFarmId(farms[0].id);
      return;
    }

    if (feedbackFarmId && !farms.find((farm) => farm.id === feedbackFarmId)) {
      setFeedbackFarmId(farms[0]?.id || "");
    }
  }, [feedbackFarmId, farms]);

  const summary = useMemo(() => {
    const totalHectares = farms.reduce((acc, farm) => {
      const trees = farm.tree_count ?? 0;
      const spacing = farm.spacing_m2 ?? 0;
      return acc + (trees * spacing) / 10000;
    }, 0);

    const stressCount = farmDetails.filter((item) => item.last_alert?.stress_mode).length;
    return { totalHectares, stressCount };
  }, [farms, farmDetails]);

  const soilShares = useMemo(() => {
    const buckets: Record<string, number> = {
      SANDY: 0,
      MEDIUM: 0,
      CLAY: 0,
      OTHER: 0,
    };

    farms.forEach((farm) => {
      const raw = (farm.soil_type || "OTHER").toUpperCase();
      if (raw === "SANDY" || raw === "MEDIUM" || raw === "CLAY") {
        buckets[raw] += 1;
      } else {
        buckets.OTHER += 1;
      }
    });

    const total = farms.length;
    const buildPercent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

    return [
      { key: "SANDY", label: "Sandy", value: buckets.SANDY, percent: buildPercent(buckets.SANDY) },
      { key: "MEDIUM", label: "Medium", value: buckets.MEDIUM, percent: buildPercent(buckets.MEDIUM) },
      { key: "CLAY", label: "Clay", value: buckets.CLAY, percent: buildPercent(buckets.CLAY) },
      { key: "OTHER", label: "Other", value: buckets.OTHER, percent: buildPercent(buckets.OTHER) },
    ];
  }, [farms]);

  const soilSegments = useMemo(() => {
    let start = 0;
    return soilShares.map((item) => {
      const segment = { ...item, start };
      start += item.percent;
      return segment;
    });
  }, [soilShares]);

  const ageBars = useMemo(() => {
    let youngTrees = 0;
    let adultTrees = 0;

    farms.forEach((farm) => {
      const trees = farm.tree_count ?? 0;
      const age = (farm.tree_age || "").toUpperCase();
      if (age === "YOUNG") {
        youngTrees += trees;
      } else {
        adultTrees += trees;
      }
    });

    const total = youngTrees + adultTrees;
    const buildPercent = (value: number) => (total > 0 ? Math.round((value / total) * 100) : 0);

    return [
      { key: "YOUNG", label: "Young trees", value: youngTrees, percent: buildPercent(youngTrees) },
      { key: "ADULT", label: "Adult trees", value: adultTrees, percent: buildPercent(adultTrees) },
    ];
  }, [farms]);

  const stressPercent = useMemo(() => {
    if (farms.length === 0) return 0;
    return Math.round((summary.stressCount / farms.length) * 100);
  }, [farms.length, summary.stressCount]);

  const activePercent = useMemo(() => {
    if (farms.length === 0) return 0;
    const active = metrics?.farmers_active || 0;
    return Math.min(100, Math.round((active / farms.length) * 100));
  }, [metrics?.farmers_active, farms.length]);

  const weeklyAlertsPercent = useMemo(() => {
    const alerts = metrics?.alerts_sent_this_week || 0;
    const target = Math.max(1, farms.length * 2);
    return Math.min(100, Math.round((alerts / target) * 100));
  }, [metrics?.alerts_sent_this_week, farms.length]);

  const avgEfficiencyPercent = useMemo(() => {
    const values = farms
      .map((farm) => farm.irrigation_efficiency)
      .filter((value): value is number => typeof value === "number" && Number.isFinite(value));

    if (values.length === 0) return 0;
    const avg = values.reduce((acc, value) => acc + value, 0) / values.length;
    return Math.round(avg * 100);
  }, [farms]);

  const ringCircumference = useMemo(() => 2 * Math.PI * 42, []);
  const stressArc = useMemo(() => (stressPercent / 100) * ringCircumference, [stressPercent, ringCircumference]);

  const selectedFarmDetail = useMemo(() => {
    if (!selectedFarmId) return null;
    return farmDetails.find((item) => item.farm.id === selectedFarmId) || null;
  }, [selectedFarmId, farmDetails]);

  const isAdmin = profile?.role === "ADMIN";

  const qrCodeUrl = useMemo(() => {
    if (!telegramLinkData?.telegram_link) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=280x280&margin=12&data=${encodeURIComponent(telegramLinkData.telegram_link)}`;
  }, [telegramLinkData]);

  const stepOneValidationError = useMemo(() => {
    const normalizedName = farmerName.trim();
    const normalizedPhone = phone.trim();
    const parsedTreeCount = Number(treeCount);
    const parsedSpacing = Number(spacingM2);
    const parsedEfficiency = Number(efficiency);

    if (!normalizedName || normalizedName.length < 2) {
      return "Farmer name must contain at least 2 characters.";
    }
    if (!normalizedPhone || normalizedPhone.length < 6) {
      return "Phone must contain at least 6 characters.";
    }
    if (!Number.isInteger(parsedTreeCount) || parsedTreeCount < 1) {
      return "Tree count must be an integer greater than or equal to 1.";
    }
    if (!Number.isFinite(parsedSpacing) || parsedSpacing <= 0) {
      return "Spacing must be a positive number.";
    }
    if (!Number.isFinite(parsedEfficiency) || parsedEfficiency < 0.5 || parsedEfficiency > 1) {
      return "Irrigation efficiency must be between 0.5 and 1.0.";
    }

    return null;
  }, [farmerName, phone, treeCount, spacingM2, efficiency]);

  const canOpenStep2 = !stepOneValidationError;

  const loadFeedback = useCallback(async (farmId: string, signal?: AbortSignal) => {
    if (!farmId) {
      setFeedbackSummary(null);
      return;
    }

    setFeedbackLoading(true);
    setFeedbackError(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const summary = await fetchFeedbackSummary(token, farmId, signal);
      setFeedbackSummary(summary);
    } catch (error) {
      if (isAbortRequestError(error)) {
        return;
      }
      setFeedbackError(toError(error));
    } finally {
      setFeedbackLoading(false);
    }
  }, []);

  const loadTelegramLink = useCallback(async (signal?: AbortSignal) => {
    setTelegramLinkLoading(true);
    setTelegramLinkError(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const link = await fetchTelegramLinkMe(token, signal);
      setTelegramLinkData(link);
    } catch (error) {
      if (isAbortRequestError(error)) {
        return;
      }
      setTelegramLinkError(toError(error));
    } finally {
      setTelegramLinkLoading(false);
    }
  }, []);

  const loadProfile = useCallback(async (signal?: AbortSignal) => {
    setProfileLoading(true);
    setProfileError(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const me = await authMe(token, signal);
      setProfile(me);
    } catch (error) {
      if (isAbortRequestError(error)) {
        return;
      }
      setProfileError(toError(error));
    } finally {
      setProfileLoading(false);
    }
  }, []);

  useEffect(() => {
    if (view !== "feedback") return;

    const controller = new AbortController();
    void loadFeedback(feedbackFarmId, controller.signal);
    return () => controller.abort();
  }, [view, feedbackFarmId, loadFeedback]);

  useEffect(() => {
    if (view !== "telegram") return;

    if (farms.length === 0) {
      setTelegramLinkData(null);
      setTelegramLinkError(null);
      setTelegramLinkLoading(false);
      return;
    }

    const controller = new AbortController();
    void loadTelegramLink(controller.signal);
    return () => controller.abort();
  }, [view, farms.length, loadTelegramLink]);

  async function onSubmitFeedback(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!feedbackFarmId) return;

    setFeedbackSubmitting(true);
    setFeedbackError(null);
    setFeedbackSubmitMessage(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const parsedRating = Number(feedbackRating);
      const ratingValue = Number.isFinite(parsedRating) ? parsedRating : undefined;

      await submitFeedback(token, {
        farmer_id: feedbackFarmId,
        feedback_type: feedbackType,
        rating: ratingValue,
        comment: feedbackComment.trim() || undefined,
      });

      setFeedbackSubmitMessage("Farmer review submitted successfully.");
      setFeedbackComment("");
      await loadFeedback(feedbackFarmId);
    } catch (error) {
      setFeedbackError(toError(error));
    } finally {
      setFeedbackSubmitting(false);
    }
  }

  async function openTelegramChatForFarm(farmId: string): Promise<{ linked: boolean } | null> {
    if (!farmId) return null;

    const token = getAccessToken();
    if (!token) throw new Error("No token found. Login first.");

    const link = await fetchTelegramLink(token, farmId);
    window.open(link.telegram_link, "_blank", "noopener,noreferrer");
    return { linked: link.linked };
  }

  async function onOpenTelegramConnection() {
    if (farms.length === 0) {
      setTelegramLinkError("No farms yet. Create a farm first, then connect Telegram.");
      setTelegramOpenMessage(null);
      return;
    }

    if (!telegramLinkData?.telegram_link) {
      await loadTelegramLink();
    }

    setTelegramLinkError(null);
    setTelegramOpenMessage(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const link = telegramLinkData ?? (await fetchTelegramLinkMe(token));
      window.open(link.telegram_link, "_blank", "noopener,noreferrer");

      setTelegramOpenMessage(link.linked ? "Linked chat opened." : "Telegram link opened.");
      setTelegramLinkData(link);
      await loadTelegramLink();
    } catch (error) {
      setTelegramLinkError(toError(error));
    }
  }

  async function onOpenSelectedFarmTelegram() {
    if (!selectedFarmId) return;

    setTelegramError(null);
    setTelegramSuccess(null);

    try {
      const opened = await openTelegramChatForFarm(selectedFarmId);
      if (!opened) return;
      setTelegramSuccess(opened.linked ? "Linked chat opened." : "Telegram link opened.");
    } catch (error) {
      setTelegramError(toError(error));
    }
  }

  async function onSendAdminTelegramUpdate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFarmId || !isAdmin) return;

    const cleanMessage = telegramMessage.trim();
    if (!cleanMessage) {
      setTelegramError("Message cannot be empty.");
      setTelegramSuccess(null);
      return;
    }

    setTelegramSending(true);
    setTelegramError(null);
    setTelegramSuccess(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const result = await sendAdminTelegramUpdate(token, {
        farmer_id: selectedFarmId,
        message: cleanMessage,
      });

      setTelegramSuccess(result.message || "Telegram update sent.");
      setTelegramMessage("");
      await loadBase();
    } catch (error) {
      setTelegramError(toError(error));
    } finally {
      setTelegramSending(false);
    }
  }

  useEffect(() => {
    if (view !== "profile") return;

    const controller = new AbortController();
    void loadProfile(controller.signal);
    return () => controller.abort();
  }, [view, loadProfile]);

  useEffect(() => {
    setTelegramError(null);
    setTelegramSuccess(null);
  }, [selectedFarmId]);

  useEffect(() => {
    setTelegramOpenMessage(null);
  }, [telegramLinkData?.owner_id]);

  function setPolygon(points: number[][]) {
    setPolygonPoints(points);
    setPolygonText(prettyPolygon(points));
  }

  function addPoint(point: [number, number]) {
    setPolygonPoints((prev) => {
      const next = [...prev, point];
      setPolygonText(prettyPolygon(next));
      return next;
    });
  }

  function movePoint(index: number, point: [number, number]) {
    setPolygonPoints((prev) => {
      if (index < 0 || index >= prev.length) return prev;
      const next = [...prev];
      next[index] = point;
      setPolygonText(prettyPolygon(next));
      return next;
    });
  }

  function undoPoint() {
    setPolygon(polygonPoints.slice(0, -1));
  }

  function clearPoints() {
    setPolygon([]);
  }

  function applyPolygonText() {
    try {
      const parsed = parsePolygonText(polygonText);
      setPolygon(parsed);
      setRegisterSuccess(`Polygon applied from text (${parsed.length} points).`);
      setRegisterError(null);
    } catch (error) {
      setRegisterError(toError(error));
      setRegisterSuccess(null);
    }
  }

  async function onCreateFarm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setRegisteringFarm(true);
    setRegisterError(null);
    setRegisterSuccess(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      if (stepOneValidationError) {
        throw new Error(stepOneValidationError);
      }

      let polygon = polygonPoints;
      if (polygonMode === "text") {
        polygon = parsePolygonText(polygonText);
        setPolygon(polygon);
      }

      const payload: RegisterFarmRequest = {
        farmer_name: farmerName.trim(),
        phone: phone.trim(),
        crop_type: cropType.trim() || "olive",
        tree_age: treeAge,
        soil_type: soilType,
        tree_count: Number(treeCount),
        spacing_m2: Number(spacingM2),
        irrigation_efficiency: Number(efficiency),
        polygon,
      };

      if (payload.polygon.length < 3) {
        throw new Error("Draw at least 3 points to create a valid polygon.");
      }

      const result = await registerFarm(token, payload);
      setRegisterSuccess(result.message || "Farm registered successfully.");

      await loadBase();
      setSelectedFarmId(result.farm_id);
      setFarmPanelView("list");
      setAddFarmStep(1);
    } catch (error) {
      setRegisterError(toError(error));
    } finally {
      setRegisteringFarm(false);
    }
  }

  function openAddFarm() {
    setFarmPanelView("add");
    setAddFarmStep(1);
    setView("farms");
    setRegisterError(null);
  }

  function onContinueToStep2() {
    if (!canOpenStep2) {
      setRegisterError(stepOneValidationError || "Complete Step 1 fields first.");
      return;
    }
    setRegisterError(null);
    setAddFarmStep(2);
  }

  function onLogout() {
    clearAccessToken();
    router.push("/auth/login");
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <p className={styles.sidebarKicker}>Dashboard navigation</p>
            <h2>Workspace</h2>

            <div className={styles.navList}>
              <button
                type="button"
                className={view === "actions" ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                onClick={() => setView("actions")}
              >
                Farmer action center
              </button>
              <button
                type="button"
                className={view === "farms" ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                onClick={() => setView("farms")}
              >
                Farms management
              </button>
              <button
                type="button"
                className={view === "telegram" ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                onClick={() => setView("telegram")}
              >
                Telegram connection
              </button>
              <Link className={styles.navLink} href="/dashboard/analysis">
                Analyze history
              </Link>
            </div>

            <div className={styles.navBottom}>
              <button
                type="button"
                className={view === "feedback" ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                onClick={() => setView("feedback")}
              >
                Feedback
              </button>
              <button
                type="button"
                className={view === "profile" ? `${styles.navLink} ${styles.navLinkActive}` : styles.navLink}
                onClick={() => setView("profile")}
              >
                Profile
              </button>
              <button type="button" className={`${styles.navLink} ${styles.navLinkDanger}`} onClick={onLogout}>
                Logout
              </button>
            </div>
          </aside>

          <main className={styles.main}>
            <header className={view === "farms" ? `${styles.topbar} ${styles.topbarCompact}` : styles.topbar}>
              <div>
                <p className={styles.brand}>OleaSat</p>
                <h1>
                  {view === "actions"
                    ? "Farmer workspace"
                    : view === "farms"
                      ? "Farms management"
                      : view === "telegram"
                        ? "Telegram connection"
                      : view === "feedback"
                        ? "Feedback"
                        : "Profile"}
                </h1>
                <p className={styles.sub}>
                  {view === "actions"
                    ? "Clean dashboard with quick access to your key actions."
                    : view === "farms"
                      ? "Review all farms, open details, and add a new farm in two steps."
                      : view === "telegram"
                        ? "Connect one Telegram account for your full profile and all its farms."
                      : view === "feedback"
                        ? "Collect farmer reviews only. Telegram linking now lives in its own section."
                        : "View your account profile and sign out from one place."}
                </p>
              </div>
            </header>

            {baseError && <p className={styles.error}>{baseError}</p>}

            {view === "actions" && (
              <section className={styles.panel}>
                <h3>Farmer action center</h3>

                <div className={styles.resultGrid}>
                  <div>
                    <span>Registered farms</span>
                    <strong>{farms.length}</strong>
                  </div>
                  <div>
                    <span>Total hectares</span>
                    <strong>{fmt(summary.totalHectares)}</strong>
                  </div>
                  <div>
                    <span>Stress alerts</span>
                    <strong>{summary.stressCount}</strong>
                  </div>
                  <div>
                    <span>Weekly alerts</span>
                    <strong>{metrics?.alerts_sent_this_week || 0}</strong>
                  </div>
                </div>

                <div className={styles.chartsGrid}>
                  <article className={styles.chartCard}>
                    <h4>Soil mix</h4>
                    <svg viewBox="0 0 100 10" className={styles.stackSvg} role="img" aria-label="Soil distribution">
                      {soilSegments.map((item) => (
                        <rect
                          key={item.key}
                          x={item.start}
                          y={0}
                          width={item.percent}
                          height={10}
                          className={`${styles.stackRect} ${
                            item.key === "SANDY"
                              ? styles.soilSandy
                              : item.key === "MEDIUM"
                                ? styles.soilMedium
                                : item.key === "CLAY"
                                  ? styles.soilClay
                                  : styles.soilOther
                          }`}
                        />
                      ))}
                    </svg>
                    <div className={styles.legendList}>
                      {soilShares.map((item) => (
                        <p key={item.key} className={styles.legendItem}>
                          <span className={styles.legendLeft}>
                            <span
                              className={`${styles.legendSwatch} ${
                                item.key === "SANDY"
                                  ? styles.soilSandy
                                  : item.key === "MEDIUM"
                                    ? styles.soilMedium
                                    : item.key === "CLAY"
                                      ? styles.soilClay
                                      : styles.soilOther
                              }`}
                            />
                            {item.label}
                          </span>
                          <strong>{item.value}</strong>
                        </p>
                      ))}
                    </div>
                  </article>

                  <article className={styles.chartCard}>
                    <h4>Tree age split</h4>
                    <div className={styles.barRows}>
                      {ageBars.map((item) => (
                        <div key={item.key} className={styles.barRow}>
                          <span>{item.label}</span>
                          <progress
                            className={`${styles.ageProgress} ${item.key === "YOUNG" ? styles.ageYoung : styles.ageAdult}`}
                            value={item.percent}
                            max={100}
                          />
                          <strong>{fmt(item.value, 0)}</strong>
                        </div>
                      ))}
                    </div>
                  </article>

                  <article className={styles.chartCard}>
                    <h4>Health snapshot</h4>
                    <div className={styles.ringBlock}>
                      <div className={styles.ring}>
                        <svg viewBox="0 0 100 100" className={styles.ringSvg} aria-hidden="true">
                          <circle cx="50" cy="50" r="42" className={styles.ringTrack} />
                          <circle
                            cx="50"
                            cy="50"
                            r="42"
                            className={styles.ringStress}
                            strokeDasharray={`${stressArc} ${Math.max(ringCircumference - stressArc, 0)}`}
                          />
                        </svg>
                        <div className={styles.ringInner}>
                          <strong>{stressPercent}%</strong>
                          <span>Stress</span>
                        </div>
                      </div>

                      <div className={styles.kpiList}>
                        <div className={styles.kpiRow}>
                          <span>Active farmers</span>
                          <progress className={`${styles.kpiProgress} ${styles.kpiActive}`} value={activePercent} max={100} />
                          <strong>{activePercent}%</strong>
                        </div>
                        <div className={styles.kpiRow}>
                          <span>Weekly alerts load</span>
                          <progress className={`${styles.kpiProgress} ${styles.kpiAlerts}`} value={weeklyAlertsPercent} max={100} />
                          <strong>{weeklyAlertsPercent}%</strong>
                        </div>
                        <div className={styles.kpiRow}>
                          <span>Avg irrigation efficiency</span>
                          <progress className={`${styles.kpiProgress} ${styles.kpiEfficiency}`} value={avgEfficiencyPercent} max={100} />
                          <strong>{avgEfficiencyPercent}%</strong>
                        </div>
                      </div>
                    </div>
                  </article>
                </div>
              </section>
            )}

            {view === "farms" && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h3>Farms workspace</h3>
                  <div className={styles.inlineActions}>
                    <button
                      type="button"
                      className={farmPanelView === "list" ? `${styles.secondaryBtn} ${styles.tabBtnActive}` : styles.secondaryBtn}
                      onClick={() => setFarmPanelView("list")}
                    >
                      Farms list
                    </button>
                    <button
                      type="button"
                      className={farmPanelView === "add" ? `${styles.secondaryBtn} ${styles.tabBtnActive}` : styles.secondaryBtn}
                      onClick={openAddFarm}
                    >
                      Add farm
                    </button>
                  </div>
                </div>

                {farmPanelView === "list" && (
                  <div className={styles.farmsLayout}>
                    <div className={styles.farmsList}>
                      {farms.length === 0 && <p className={styles.muted}>No farms yet.</p>}
                      {farms.map((farm) => (
                        <button
                          key={farm.id}
                          type="button"
                          className={farm.id === selectedFarmId ? `${styles.farmItem} ${styles.farmItemActive}` : styles.farmItem}
                          onClick={() => setSelectedFarmId(farm.id)}
                        >
                          <div className={styles.farmItemHead}>
                            <span
                              className={farm.id === selectedFarmId ? `${styles.farmIcon} ${styles.farmIconActive}` : styles.farmIcon}
                              aria-hidden="true"
                            />
                            <strong>{farm.farmer_name || "Unnamed farm"}</strong>
                            {farm.id === selectedFarmId && <span className={styles.farmSelectedBadge}>Selected</span>}
                          </div>
                          <span>{farm.tree_count || 0} trees</span>
                        </button>
                      ))}
                    </div>

                    <div className={styles.farmDetails}>
                      {!selectedFarmDetail && <p className={styles.muted}>Select a farm to view details.</p>}
                      {selectedFarmDetail && (
                        <>
                          <div className={styles.resultGrid}>
                            <div>
                              <span>Name</span>
                              <strong>{selectedFarmDetail.farm.farmer_name || "-"}</strong>
                            </div>
                            <div>
                              <span>Phone</span>
                              <strong>{selectedFarmDetail.farm.phone || "-"}</strong>
                            </div>
                            <div>
                              <span>Tree age</span>
                              <strong>{selectedFarmDetail.farm.tree_age || "-"}</strong>
                            </div>
                            <div>
                              <span>Soil type</span>
                              <strong>{selectedFarmDetail.farm.soil_type || "-"}</strong>
                            </div>
                            <div>
                              <span>Tree count</span>
                              <strong>{selectedFarmDetail.farm.tree_count || 0}</strong>
                            </div>
                            <div>
                              <span>Spacing m2</span>
                              <strong>{selectedFarmDetail.farm.spacing_m2 || 0}</strong>
                            </div>
                          </div>

                          <div className={styles.lastAlertBlock}>
                            <h4>Last recommendation</h4>
                            {!selectedFarmDetail.last_alert && <p className={styles.muted}>No alerts yet.</p>}
                            {selectedFarmDetail.last_alert && (
                              <div className={styles.resultGrid}>
                                <div>
                                  <span>Litres/tree</span>
                                  <strong>{fmt(selectedFarmDetail.last_alert.litres_per_tree, 2)}</strong>
                                </div>
                                <div>
                                  <span>Total m3</span>
                                  <strong>{fmt((selectedFarmDetail.last_alert.total_litres || 0) / 1000, 2)}</strong>
                                </div>
                                <div>
                                  <span>Stress mode</span>
                                  <strong>{selectedFarmDetail.last_alert.stress_mode ? "YES" : "NO"}</strong>
                                </div>
                                <div>
                                  <span>Sent at</span>
                                  <strong>{new Date(selectedFarmDetail.last_alert.sent_at).toLocaleString()}</strong>
                                </div>
                              </div>
                            )}
                          </div>

                          {isAdmin && (
                            <div className={styles.lastAlertBlock}>
                              <h4>Admin Telegram update</h4>
                              <form className={styles.feedbackComposer} onSubmit={onSendAdminTelegramUpdate}>
                                <label className={`${styles.fieldBlock} ${styles.fieldWide}`}>
                                  Message to this farmer
                                  <textarea
                                    rows={3}
                                    value={telegramMessage}
                                    onChange={(event) => setTelegramMessage(event.target.value)}
                                    placeholder="Write a specific update for this farmer..."
                                  />
                                </label>

                                <div className={styles.inlineActions}>
                                  <button
                                    type="submit"
                                    className={styles.primaryBtn}
                                    disabled={telegramSending || !selectedFarmDetail.farm.telegram_linked}
                                  >
                                    {telegramSending ? "Sending..." : "Send Telegram update"}
                                  </button>
                                  <button
                                    type="button"
                                    className={styles.secondaryBtn}
                                    onClick={() => void onOpenSelectedFarmTelegram()}
                                    disabled={!selectedFarmDetail.farm.telegram_linked}
                                  >
                                    Open farmer chat
                                  </button>
                                </div>
                              </form>

                              {!selectedFarmDetail.farm.telegram_linked && (
                                <p className={styles.muted}>This farm is not linked to Telegram yet.</p>
                              )}
                              {telegramError && <p className={styles.errorInline}>{telegramError}</p>}
                              {telegramSuccess && <p className={styles.successInline}>{telegramSuccess}</p>}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )}

                {farmPanelView === "add" && (
                  <form className={styles.addFarmFlow} onSubmit={onCreateFarm}>
                    <div className={styles.stepTabs}>
                      <button
                        type="button"
                        className={addFarmStep === 1 ? `${styles.stepTab} ${styles.stepTabActive}` : styles.stepTab}
                        onClick={() => setAddFarmStep(1)}
                      >
                        Step 1: General info
                      </button>
                      <button
                        type="button"
                        className={addFarmStep === 2 ? `${styles.stepTab} ${styles.stepTabActive}` : styles.stepTab}
                        onClick={onContinueToStep2}
                        disabled={!canOpenStep2}
                      >
                        Step 2: Polygon
                      </button>
                    </div>

                    {addFarmStep === 1 && (
                      <div className={styles.formGrid}>
                        <label className={styles.fieldBlock}>
                          Farmer name
                          <input value={farmerName} onChange={(event) => setFarmerName(event.target.value)} required minLength={2} />
                        </label>

                        <label className={styles.fieldBlock}>
                          Phone
                          <input value={phone} onChange={(event) => setPhone(event.target.value)} required minLength={6} />
                        </label>

                        <label className={styles.fieldBlock}>
                          Crop type
                          <input value={cropType} onChange={(event) => setCropType(event.target.value)} />
                        </label>

                        <label className={styles.fieldBlock}>
                          Tree age
                          <select value={treeAge} onChange={(event) => setTreeAge(event.target.value as TreeAge)}>
                            <option value="ADULT">ADULT</option>
                            <option value="YOUNG">YOUNG</option>
                          </select>
                        </label>

                        <label className={styles.fieldBlock}>
                          Soil type
                          <select value={soilType} onChange={(event) => setSoilType(event.target.value as SoilType)}>
                            <option value="MEDIUM">MEDIUM</option>
                            <option value="SANDY">SANDY</option>
                            <option value="CLAY">CLAY</option>
                          </select>
                        </label>

                        <label className={styles.fieldBlock}>
                          Tree count
                          <input type="number" min={1} step={1} value={treeCount} onChange={(event) => setTreeCount(event.target.value)} required />
                        </label>

                        <label className={styles.fieldBlock}>
                          Spacing m2
                          <input type="number" min={0.1} step={0.1} value={spacingM2} onChange={(event) => setSpacingM2(event.target.value)} required />
                        </label>

                        <label className={styles.fieldBlock}>
                          Irrigation efficiency
                          <input type="number" min={0.5} max={1} step={0.01} value={efficiency} onChange={(event) => setEfficiency(event.target.value)} required />
                        </label>

                        <div className={styles.formActions}>
                          <button type="button" className={styles.primaryBtn} onClick={onContinueToStep2} disabled={!canOpenStep2}>
                            Continue to Step 2
                          </button>
                        </div>
                      </div>
                    )}

                    {addFarmStep === 2 && (
                      <div className={styles.polygonStep}>
                        <div className={styles.modeSwitch}>
                          <button
                            type="button"
                            className={polygonMode === "map" ? `${styles.modeButton} ${styles.modeButtonActive}` : styles.modeButton}
                            onClick={() => setPolygonMode("map")}
                          >
                            Draw on map
                          </button>
                          <button
                            type="button"
                            className={polygonMode === "text" ? `${styles.modeButton} ${styles.modeButtonActive}` : styles.modeButton}
                            onClick={() => setPolygonMode("text")}
                          >
                            Paste polygon text
                          </button>
                        </div>

                        {polygonMode === "text" && (
                          <label className={styles.fieldBlock}>
                            Polygon coordinates (JSON)
                            <textarea
                              rows={7}
                              value={polygonText}
                              onChange={(event) => setPolygonText(event.target.value)}
                              spellCheck={false}
                              placeholder="[[longitude, latitude], ...]"
                            />
                          </label>
                        )}

                        <div className={styles.mapTools}>
                          <button type="button" className={styles.secondaryBtn} onClick={applyPolygonText}>
                            Apply text polygon
                          </button>
                          <button type="button" className={styles.secondaryBtn} onClick={() => setPolygon(SAMPLE_POLYGON)}>
                            Use sample polygon
                          </button>
                          <button type="button" className={styles.secondaryBtn} onClick={undoPoint} disabled={polygonPoints.length === 0}>
                            Undo last point
                          </button>
                          <button type="button" className={styles.secondaryBtn} onClick={clearPoints} disabled={polygonPoints.length === 0}>
                            Clear drawing
                          </button>
                        </div>

                        <div className={styles.mapBox}>
                          <ParcelDrawMap
                            points={polygonPoints as [number, number][]}
                            onAddPoint={addPoint}
                            onMovePoint={movePoint}
                            className={styles.mapLeaflet}
                          />
                        </div>

                        <p className={styles.muted}>
                          Map is focused on north Morocco. Click to add points, drag points to move them, and use clear/undo tools.
                        </p>

                        <div className={styles.inlineActions}>
                          <button type="button" className={styles.secondaryBtn} onClick={() => setAddFarmStep(1)}>
                            Back to Step 1
                          </button>
                          <button type="submit" className={styles.primaryBtn} disabled={registeringFarm}>
                            {registeringFarm ? "Creating farm..." : "Create farm"}
                          </button>
                        </div>
                      </div>
                    )}

                    {registerError && <p className={styles.errorInline}>{registerError}</p>}
                    {registerSuccess && <p className={styles.successInline}>{registerSuccess}</p>}
                  </form>
                )}
              </section>
            )}

            {view === "telegram" && (
              <section className={styles.panel}>
                <div className={styles.telegramLayout}>
                  <div className={styles.telegramLead}>
                    <span className={styles.telegramBadge}>Telegram</span>
                    <h3>Connect one Telegram chat for all your farms</h3>
                    <p className={styles.muted}>
                      Connect your profile once. If your account has multiple farms, they all use the same Telegram chat.
                    </p>

                    <p className={styles.navHint}>
                      {telegramLinkData
                        ? `Profile farms covered: ${telegramLinkData.farms_count}`
                        : `Profile farms covered: ${farms.length}`}
                    </p>

                    <ol className={styles.telegramSteps}>
                      <li>Scan the QR code or click Open in Telegram.</li>
                      <li>Tap Start in Telegram chat to link your profile.</li>
                      <li>Receive alerts for all farms in this account.</li>
                    </ol>
                  </div>

                  <div className={styles.telegramCard}>
                    <div className={styles.telegramQrFrame}>
                      {telegramLinkLoading && <p className={styles.muted}>Generating QR code...</p>}
                      {!telegramLinkLoading && telegramLinkData && qrCodeUrl && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={qrCodeUrl} alt="Telegram link QR code" className={styles.telegramQrImage} />
                      )}
                      {!telegramLinkLoading && !telegramLinkData && farms.length > 0 && (
                        <p className={styles.muted}>Generating profile link...</p>
                      )}
                      {!telegramLinkLoading && !telegramLinkData && farms.length === 0 && (
                        <p className={styles.muted}>Create your first farm to enable Telegram connection.</p>
                      )}
                    </div>

                    <button
                      type="button"
                      className={styles.primaryBtn}
                      onClick={() => void onOpenTelegramConnection()}
                      disabled={farms.length === 0 || telegramLinkLoading || !telegramLinkData?.telegram_link}
                    >
                      Open in Telegram
                    </button>

                    {telegramLinkData?.telegram_link && (
                      <a
                        className={styles.telegramDeepLink}
                        href={telegramLinkData.telegram_link}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        {telegramLinkData.telegram_link}
                      </a>
                    )}

                    <p className={styles.telegramHint}>You will be redirected to Telegram mobile or desktop app.</p>
                  </div>
                </div>

                {telegramLinkError && <p className={styles.errorInline}>{telegramLinkError}</p>}
                {telegramOpenMessage && <p className={styles.successInline}>{telegramOpenMessage}</p>}
              </section>
            )}

            {view === "feedback" && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h3>Feedback overview</h3>
                  <div className={styles.inlineActions}>
                    <button
                      type="button"
                      className={styles.secondaryBtn}
                      onClick={() => void loadFeedback(feedbackFarmId)}
                      disabled={feedbackLoading || !feedbackFarmId}
                    >
                      {feedbackLoading ? "Loading..." : "Refresh"}
                    </button>
                  </div>
                </div>

                <div className={styles.analysisForm}>
                  <label className={styles.fieldBlock}>
                    Farm
                    <select
                      value={feedbackFarmId}
                      onChange={(event) => setFeedbackFarmId(event.target.value)}
                      disabled={farms.length === 0}
                    >
                      {farms.length === 0 && <option value="">No farms</option>}
                      {farms.map((farm) => (
                        <option key={farm.id} value={farm.id}>{farm.farmer_name || "Unnamed farm"}</option>
                      ))}
                    </select>
                  </label>
                </div>

                <form className={styles.feedbackComposer} onSubmit={onSubmitFeedback}>
                  <div className={styles.formGrid}>
                    <label className={styles.fieldBlock}>
                      Feedback type
                      <select value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as FeedbackType)}>
                        {FEEDBACK_TYPES.map((type) => (
                          <option key={type} value={type}>{type}</option>
                        ))}
                      </select>
                    </label>

                    <label className={styles.fieldBlock}>
                      Rating (1-5)
                      <input
                        type="number"
                        min={1}
                        max={5}
                        value={feedbackRating}
                        onChange={(event) => setFeedbackRating(event.target.value)}
                      />
                    </label>

                    <label className={`${styles.fieldBlock} ${styles.fieldWide}`}>
                      Farmer review
                      <textarea
                        rows={3}
                        value={feedbackComment}
                        onChange={(event) => setFeedbackComment(event.target.value)}
                        placeholder="Type what the farmer said about the recommendation..."
                      />
                    </label>
                  </div>

                  <div className={styles.inlineActions}>
                    <button type="submit" className={styles.primaryBtn} disabled={feedbackSubmitting || !feedbackFarmId}>
                      {feedbackSubmitting ? "Submitting..." : "Send farmer review"}
                    </button>
                  </div>
                </form>

                {feedbackError && <p className={styles.errorInline}>{feedbackError}</p>}
                {feedbackSubmitMessage && <p className={styles.successInline}>{feedbackSubmitMessage}</p>}

                {feedbackSummary && (
                  <>
                    <div className={styles.resultGrid}>
                      <div>
                        <span>Total</span>
                        <strong>{feedbackSummary.total_feedback}</strong>
                      </div>
                      <div>
                        <span>Worked</span>
                        <strong>{feedbackSummary.worked_count}</strong>
                      </div>
                      <div>
                        <span>Too much</span>
                        <strong>{feedbackSummary.too_much_count}</strong>
                      </div>
                      <div>
                        <span>Too little</span>
                        <strong>{feedbackSummary.too_little_count}</strong>
                      </div>
                      <div>
                        <span>Not applied</span>
                        <strong>{feedbackSummary.not_applied_count}</strong>
                      </div>
                      <div>
                        <span>Avg rating</span>
                        <strong>{feedbackSummary.avg_rating.toFixed(2)}</strong>
                      </div>
                    </div>

                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Date</th>
                            <th>Type</th>
                            <th>Rating</th>
                            <th>Comment</th>
                          </tr>
                        </thead>
                        <tbody>
                          {feedbackSummary.feedback.length === 0 && (
                            <tr>
                              <td colSpan={4}>No feedback records yet.</td>
                            </tr>
                          )}
                          {feedbackSummary.feedback.slice(0, 12).map((item) => (
                            <tr key={item.id}>
                              <td>{new Date(item.created_at).toLocaleString()}</td>
                              <td>{item.feedback_type}</td>
                              <td>{item.rating ?? "-"}</td>
                              <td>{item.comment || "-"}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}

                {!feedbackSummary && !feedbackError && !feedbackLoading && (
                  <p className={styles.muted}>Select a farm to load feedback summary.</p>
                )}
              </section>
            )}

            {view === "profile" && (
              <section className={styles.panel}>
                <div className={styles.panelHeader}>
                  <h3>My profile</h3>
                  <button type="button" className={styles.secondaryBtn} onClick={() => void loadProfile()} disabled={profileLoading}>
                    {profileLoading ? "Loading..." : "Refresh"}
                  </button>
                </div>

                {profileError && <p className={styles.errorInline}>{profileError}</p>}

                {profile && (
                  <div className={styles.resultGrid}>
                    <div>
                      <span>Full name</span>
                      <strong>{profile.full_name || "-"}</strong>
                    </div>
                    <div>
                      <span>Email</span>
                      <strong>{profile.email}</strong>
                    </div>
                    <div>
                      <span>Role</span>
                      <strong>{profile.role}</strong>
                    </div>
                    <div>
                      <span>Status</span>
                      <strong>{profile.is_active ? "Active" : "Inactive"}</strong>
                    </div>
                  </div>
                )}

                <div className={styles.inlineActions}>
                  <button type="button" className={`${styles.secondaryBtn} ${styles.navLinkDanger}`} onClick={onLogout}>
                    Logout
                  </button>
                </div>
              </section>
            )}

            {loadingBase && <p className={styles.muted}>Loading dashboard...</p>}
          </main>
        </div>
      </div>
    </div>
  );
}