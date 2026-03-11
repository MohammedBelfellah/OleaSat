"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import styles from "../page.module.css";
import {
  ApiError,
  createAnalysisRun,
  fetchAnalysisRuns,
  fetchFarms,
  type AnalysisRunItem,
  type FarmListItem,
} from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth";

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
  return "Unexpected analysis list error";
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

function fmt(value?: number | null, digits = 2): string {
  if (value === null || value === undefined) return "-";
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

export default function DashboardAnalysisListPage() {
  const router = useRouter();

  const [loadingFarms, setLoadingFarms] = useState(true);
  const [loadingRuns, setLoadingRuns] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [farms, setFarms] = useState<FarmListItem[]>([]);
  const [runs, setRuns] = useState<AnalysisRunItem[]>([]);

  const [farmFilterId, setFarmFilterId] = useState("");
  const [newFarmId, setNewFarmId] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadFarms = useCallback(async (signal?: AbortSignal) => {
    setLoadingFarms(true);
    setErrorMessage(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const list = await fetchFarms(token, signal);
      setFarms(list);
      if (!farmFilterId && list[0]?.id) setFarmFilterId(list[0].id);
      if (!newFarmId && list[0]?.id) setNewFarmId(list[0].id);
    } catch (error) {
      if (isAbortRequestError(error)) {
        return;
      }
      setErrorMessage(toError(error));
    } finally {
      setLoadingFarms(false);
    }
  }, [farmFilterId, newFarmId]);

  const loadRuns = useCallback(async (signal?: AbortSignal) => {
    setLoadingRuns(true);
    setErrorMessage(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const result = await fetchAnalysisRuns(
        token,
        farmFilterId ? { farm_id: farmFilterId } : undefined,
        signal,
      );
      setRuns(result.runs);
    } catch (error) {
      if (isAbortRequestError(error)) {
        return;
      }
      setErrorMessage(toError(error));
    } finally {
      setLoadingRuns(false);
    }
  }, [farmFilterId]);

  useEffect(() => {
    const controller = new AbortController();
    void loadFarms(controller.signal);
    return () => controller.abort();
  }, [loadFarms]);

  useEffect(() => {
    const controller = new AbortController();
    void loadRuns(controller.signal);
    return () => controller.abort();
  }, [loadRuns]);

  async function onCreateAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");
      if (!newFarmId) throw new Error("Select a farm first.");
      if (startDate && endDate && startDate > endDate) throw new Error("Start date must be before end date.");

      const result = await createAnalysisRun(token, {
        farm_id: newFarmId,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
      });

      if (result.status === "existing") {
        setSuccessMessage("Analysis already exists. Opening saved result...");
      } else {
        setSuccessMessage("Analysis created. Opening result...");
      }

      window.setTimeout(() => {
        router.push(`/dashboard/analysis/${result.analysis_id}`);
      }, 250);
    } catch (error) {
      setErrorMessage(toError(error));
    } finally {
      setSubmitting(false);
    }
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
              <Link className={styles.navLink} href="/dashboard?view=telegram">
                <span className={styles.navButtonLabel}>
                  <SidebarGlyph name="message" className={styles.navGlyph} />
                  <span>Telegram connection</span>
                </span>
              </Link>
              <Link className={`${styles.navLink} ${styles.navLinkActive}`} href="/dashboard/analysis">
                <span className={styles.navButtonLabel}>
                  <SidebarGlyph name="water" className={styles.navGlyph} />
                  <span>Analyze history</span>
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
                <h1>Analysis runs</h1>
                <p className={styles.sub}>Open old analyses from DB or create a new analysis for an existing farm.</p>
              </div>
            </header>

            {errorMessage && <p className={styles.error}>{errorMessage}</p>}

            <section className={styles.panel}>
              <div className={styles.panelHeader}>
                <h3>Filter old analyses</h3>
                <button className={styles.secondaryBtn} onClick={() => void loadRuns()} disabled={loadingRuns}>
                  {loadingRuns ? "Refreshing..." : "Refresh list"}
                </button>
              </div>

              <div className={styles.analysisForm}>
                <label className={styles.fieldBlock}>
                  Farm
                  <select
                    value={farmFilterId}
                    onChange={(event) => setFarmFilterId(event.target.value)}
                    disabled={loadingFarms || farms.length === 0}
                  >
                    {farms.length === 0 && <option value="">No farms</option>}
                    {farms.map((farm) => (
                      <option key={farm.id} value={farm.id}>{farm.farmer_name || "Unnamed farm"}</option>
                    ))}
                  </select>
                </label>
              </div>
            </section>

            <section className={styles.panel}>
              <h3>Create new analysis</h3>
              <form className={styles.analysisForm} onSubmit={onCreateAnalysis}>
                <label className={styles.fieldBlock}>
                  Farm
                  <select
                    value={newFarmId}
                    onChange={(event) => setNewFarmId(event.target.value)}
                    disabled={loadingFarms || farms.length === 0}
                    required
                  >
                    {farms.length === 0 && <option value="">No farms</option>}
                    {farms.map((farm) => (
                      <option key={farm.id} value={farm.id}>{farm.farmer_name || "Unnamed farm"}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.fieldBlock}>
                  Start date
                  <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
                </label>

                <label className={styles.fieldBlock}>
                  End date
                  <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
                </label>

                <button className={styles.primaryBtn} type="submit" disabled={submitting || !newFarmId}>
                  {submitting ? "Saving..." : "Run new analysis"}
                </button>
              </form>

              {successMessage && <p className={styles.successInline}>{successMessage}</p>}
            </section>

            <section className={styles.panel}>
              <h3>Saved analyses</h3>
              <div className={styles.tableWrap}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th>Generated</th>
                      <th>Farm</th>
                      <th>Window</th>
                      <th>Recommendation</th>
                      <th>L/tree</th>
                      <th>Total m3</th>
                      <th>Map</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!loadingRuns && runs.length === 0 && (
                      <tr>
                        <td colSpan={7}>No saved analyses for this filter yet.</td>
                      </tr>
                    )}
                    {runs.map((run) => (
                      <tr
                        key={run.id}
                        className={styles.tableRowClickable}
                        onClick={() => router.push(`/dashboard/analysis/${run.id}`)}
                      >
                        <td>{fmtDate(run.created_at)}</td>
                        <td>{run.farmer_name || "Unnamed farm"}</td>
                        <td>{run.start_date} {"->"} {run.end_date}</td>
                        <td>{run.recommendation || "-"}</td>
                        <td>{fmt(run.litres_per_tree)}</td>
                        <td>{fmt(run.total_m3)}</td>
                        <td>{run.has_water_map ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
}
