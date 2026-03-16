"use client";

import dynamic from "next/dynamic";
import Image from "next/image";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

import styles from "../../page.module.css";
import { ApiError, fetchAnalysisRunDetail, type AnalysisRunDetailResponse } from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth";

const WaterStressMap = dynamic(() => import("@/components/maps/WaterStressMap"), { ssr: false });

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
  return "Unexpected analysis detail error";
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

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

type SidebarGlyphName = "spark" | "farm" | "message" | "water" | "feedback" | "profile" | "logout";

function SidebarGlyph({ name, className }: { name: SidebarGlyphName; className?: string }) {
  const classes = className ? `${styles.glyph} ${className}` : styles.glyph;
  const common = {
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    className: classes,
    "aria-hidden": true,
  };

  switch (name) {
    case "spark":
      return (
        <svg {...common}>
          <path d="m12 3 1.8 4.2L18 9l-4.2 1.8L12 15l-1.8-4.2L6 9l4.2-1.8Z" />
          <path d="M5 18h.01" />
          <path d="M19 18h.01" />
        </svg>
      );
    case "farm":
      return (
        <svg {...common}>
          <path d="M4 18c1.5-4 4.3-6 8-6s6.5 2 8 6" />
          <path d="M12 12V4" />
          <path d="M12 4c-2.4 0-4 1.7-4 4 2.4 0 4-1.6 4-4Z" />
          <path d="M12 4c2.4 0 4 1.7 4 4-2.4 0-4-1.6-4-4Z" />
        </svg>
      );
    case "message":
      return (
        <svg {...common}>
          <path d="m21 4-3 15-5.5-4-3 2 1-5 10.5-8z" />
          <path d="M10.5 12 18 19" />
        </svg>
      );
    case "water":
      return (
        <svg {...common}>
          <path d="M12 3s5 5.3 5 9a5 5 0 0 1-10 0c0-3.7 5-9 5-9Z" />
          <path d="M10 15c.6.7 1.2 1 2 1 1.7 0 3-1.3 3-3" />
        </svg>
      );
    case "feedback":
      return (
        <svg {...common}>
          <path d="M5 6h14v9H8l-3 3z" />
          <path d="M9 10h6" />
        </svg>
      );
    case "profile":
      return (
        <svg {...common}>
          <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" />
          <path d="M5 20a7 7 0 0 1 14 0" />
        </svg>
      );
    case "logout":
      return (
        <svg {...common}>
          <path d="M10 17v2a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3a2 2 0 0 1 2 2v2" />
          <path d="M21 12H9" />
          <path d="m16 7 5 5-5 5" />
        </svg>
      );
  }
}

export default function DashboardAnalysisDetailPage() {
  const router = useRouter();
  const params = useParams<{ analysisId: string }>();

  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detail, setDetail] = useState<AnalysisRunDetailResponse | null>(null);

  useEffect(() => {
    const controller = new AbortController();

    async function load() {
      setLoading(true);
      setErrorMessage(null);

      try {
        const token = getAccessToken();
        if (!token) throw new Error("No token found. Login first.");
        if (!params.analysisId) throw new Error("Missing analysis id.");

        const result = await fetchAnalysisRunDetail(token, params.analysisId, controller.signal);
        setDetail(result);
      } catch (error) {
        if (isAbortRequestError(error)) {
          return;
        }
        setErrorMessage(toError(error));
      } finally {
        setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [params.analysisId]);

  function onLogout() {
    clearAccessToken();
    router.push("/auth/login");
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <div className={styles.workspace}>
          <aside className={styles.sidebar}>
            <div className={styles.sidebarLogoWrap}>
              <Image className={styles.sidebarLogo} src="/logo.png" alt="OleaSat" width={180} height={72} priority />
            </div>

            <div className={styles.navList}>
              <Link className={styles.navLink} href="/dashboard">
                <span className={styles.navButtonLabel}>
                  <SidebarGlyph name="spark" className={styles.navGlyph} />
                  <span>Farmer action center</span>
                </span>
              </Link>
              <Link className={styles.navLink} href="/dashboard?view=farms">
                <span className={styles.navButtonLabel}>
                  <SidebarGlyph name="farm" className={styles.navGlyph} />
                  <span>Farms management</span>
                </span>
              </Link>
              <Link className={`${styles.navLink} ${styles.navLinkActive}`} href="/dashboard/analysis">
                <span className={styles.navButtonLabel}>
                  <SidebarGlyph name="water" className={styles.navGlyph} />
                  <span>Analyze</span>
                </span>
              </Link>
              <Link className={styles.navLink} href="/dashboard?view=telegram">
                <span className={styles.navButtonLabel}>
                  <SidebarGlyph name="message" className={styles.navGlyph} />
                  <span>Telegram connection</span>
                </span>
              </Link>
            </div>

            <div className={styles.navBottom}>
              <Link className={styles.navLink} href="/dashboard?view=feedback">
                <span className={styles.navButtonLabel}>
                  <SidebarGlyph name="feedback" className={styles.navGlyph} />
                  <span>Feedback</span>
                </span>
              </Link>
              <Link className={styles.navLink} href="/dashboard?view=profile">
                <span className={styles.navButtonLabel}>
                  <SidebarGlyph name="profile" className={styles.navGlyph} />
                  <span>Profile</span>
                </span>
              </Link>
              <button type="button" className={`${styles.navLink} ${styles.navLinkDanger}`} onClick={onLogout}>
                <span className={styles.navButtonLabel}>
                  <SidebarGlyph name="logout" className={styles.navGlyph} />
                  <span>Logout</span>
                </span>
              </button>
            </div>
          </aside>

          <main className={styles.main}>
            <header className={`${styles.topbar} ${styles.topbarCompact}`}>
              <div>
                <p className={styles.brand}>OleaSat</p>
                <h1>Analysis result</h1>
                <p className={styles.sub}>
                  {detail
                    ? `${detail.farmer_name || "Unnamed farm"} | ${detail.start_date} -> ${detail.end_date}`
                    : "Loading saved analysis details..."}
                </p>
              </div>
            </header>

            {errorMessage && <p className={styles.error}>{errorMessage}</p>}

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h3>Saved run details</h3>
                <button className={styles.secondaryBtn} onClick={() => router.push("/dashboard/analysis")}>
                  Back to list
                </button>
              </div>

              {loading && <p className={styles.muted}>Loading analysis detail...</p>}

              {detail && (
                <>
                  <div className={styles.resultGrid}>
                    <div>
                      <span>Generated</span>
                      <strong>{fmtDate(detail.created_at)}</strong>
                    </div>
                    <div>
                      <span>Recommendation</span>
                      <strong>{detail.analysis.recommendation}</strong>
                    </div>
                    <div>
                      <span>Litres/tree</span>
                      <strong>{fmt(detail.analysis.litres_per_tree, 2)}</strong>
                    </div>
                    <div>
                      <span>Total m3</span>
                      <strong>{fmt(detail.analysis.total_m3, 2)}</strong>
                    </div>
                    <div>
                      <span>NDMI</span>
                      <strong>{fmt(detail.analysis.ndmi_current, 3)}</strong>
                    </div>
                    <div>
                      <span>NDVI</span>
                      <strong>{fmt(detail.analysis.ndvi_current, 3)}</strong>
                    </div>
                    <div>
                      <span>ET0 week</span>
                      <strong>{fmt(detail.analysis.et0_week, 2)}</strong>
                    </div>
                    <div>
                      <span>Rain week</span>
                      <strong>{fmt(detail.analysis.rain_week, 2)}</strong>
                    </div>
                  </div>

                  <div className={styles.mapBox}>
                    <WaterStressMap cells={detail.water_map.cells || []} className={styles.mapLeaflet} />
                  </div>
                </>
              )}
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
