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
                Farmer action center
              </Link>
              <Link className={styles.navLink} href="/dashboard?view=farms">
                Farms management
              </Link>
              <Link className={`${styles.navLink} ${styles.navLinkActive}`} href="/dashboard/analysis">
                Analyze history
              </Link>
            </div>

            <div className={styles.navBottom}>
              <Link className={styles.navLink} href="/dashboard?view=feedback">
                Feedback
              </Link>
              <Link className={styles.navLink} href="/dashboard?view=profile">
                Profile
              </Link>
              <button type="button" className={`${styles.navLink} ${styles.navLinkDanger}`} onClick={onLogout}>
                Logout
              </button>
            </div>
          </aside>

          <main className={styles.main}>
            <header className={styles.topbar}>
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
