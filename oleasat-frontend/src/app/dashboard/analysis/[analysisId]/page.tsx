"use client";

import dynamic from "next/dynamic";
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
            <p className={styles.sidebarKicker}>Dashboard navigation</p>
            <h2>Workspace</h2>

            <div className={styles.navList}>
              <Link className={styles.navLink} href="/dashboard">
                Farmer action center
              </Link>
              <Link className={styles.navLink} href="/dashboard?view=farms">
                Farms management
              </Link>
              <Link className={styles.navLink} href="/dashboard?view=telegram">
                Telegram connection
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
