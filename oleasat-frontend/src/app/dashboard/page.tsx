"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

import styles from "./page.module.css";
import {
  ApiError,
  type FarmDetailResponse,
  type FarmListItem,
  type MetricsSummaryResponse,
  fetchFarmDetail,
  fetchFarms,
  fetchMetricsSummary,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

function toDashboardError(error: unknown): string {
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

function fmtNumber(value: number): string {
  return new Intl.NumberFormat("en-US").format(value);
}

function fmtOneDecimal(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 1 }).format(value);
}

function barHeightClass(percent: number, stylesObj: Record<string, string>): string {
  if (percent >= 90) return stylesObj.barH90;
  if (percent >= 80) return stylesObj.barH80;
  if (percent >= 70) return stylesObj.barH70;
  if (percent >= 60) return stylesObj.barH60;
  if (percent >= 50) return stylesObj.barH50;
  if (percent >= 40) return stylesObj.barH40;
  if (percent >= 30) return stylesObj.barH30;
  if (percent >= 20) return stylesObj.barH20;
  return stylesObj.barH12;
}

export default function DashboardPage() {
  const [loading, setLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<MetricsSummaryResponse | null>(null);
  const [farms, setFarms] = useState<FarmListItem[]>([]);
  const [farmDetails, setFarmDetails] = useState<FarmDetailResponse[]>([]);

  async function loadDashboard(signal?: AbortSignal) {
    setLoading(true);
    setErrorMessage(null);

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("No token found. Login first to open the dashboard.");
      }

      const [summary, farmList] = await Promise.all([
        fetchMetricsSummary(token, signal),
        fetchFarms(token, signal),
      ]);

      const details = await Promise.all(
        farmList.map(async (farm) => {
          try {
            return await fetchFarmDetail(token, farm.id, signal);
          } catch {
            return { farm, last_alert: null } as FarmDetailResponse;
          }
        }),
      );

      setMetrics(summary);
      setFarms(farmList);
      setFarmDetails(details);
    } catch (error) {
      setErrorMessage(toDashboardError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadDashboard(controller.signal);
    }, 0);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, []);

  const derived = useMemo(() => {
    const totalHectares = farms.reduce((sum, farm) => {
      const trees = farm.tree_count ?? 0;
      const spacing = farm.spacing_m2 ?? 0;
      return sum + (trees * spacing) / 10000;
    }, 0);

    const actionable = farmDetails
      .filter((item) => item.last_alert)
      .sort((a, b) => {
        const aStress = a.last_alert?.stress_mode ? 1 : 0;
        const bStress = b.last_alert?.stress_mode ? 1 : 0;
        if (bStress !== aStress) return bStress - aStress;

        const aLitres = a.last_alert?.litres_per_tree ?? 0;
        const bLitres = b.last_alert?.litres_per_tree ?? 0;
        return bLitres - aLitres;
      });

    const stressCount = actionable.filter((item) => item.last_alert?.stress_mode).length;
    const nextFarm = actionable[0];

    const trendSource = actionable
      .map((item) => item.last_alert)
      .filter((item): item is NonNullable<FarmDetailResponse["last_alert"]> => Boolean(item))
      .slice(0, 7)
      .reverse();

    const trendValues = trendSource.map((item) => item.litres_per_tree);
    const maxTrend = Math.max(...trendValues, 1);

    return {
      totalHectares,
      stressCount,
      actionPlan: actionable.slice(0, 3),
      nextFarm,
      trendValues,
      maxTrend,
    };
  }, [farmDetails, farms]);

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.brand}>OleaSat</p>
            <h1>Dashboard overview</h1>
            <p className={styles.sub}>Monitoring active farms and irrigation stress signals.</p>
          </div>

          <div className={styles.topActions}>
            <Link className={styles.topLink} href="/farms/new">
              + New farm
            </Link>
            <Link className={styles.topLink} href="/auth/me">
              Profile
            </Link>
          </div>
        </header>

        {errorMessage && <p className={styles.error}>{errorMessage}</p>}

        <section className={styles.summaryGrid}>
          <article className={styles.summaryCard}>
            <p>Total hectares</p>
            <h2>{fmtOneDecimal(derived.totalHectares)} ha</h2>
            <small>{fmtNumber(metrics?.farmers_active ?? 0)} active farmers</small>
          </article>

          <article className={styles.summaryCard}>
            <p>Active alerts</p>
            <h2>{fmtNumber(derived.stressCount)}</h2>
            <small>{fmtNumber(metrics?.alerts_sent_this_week ?? 0)} alerts this week</small>
          </article>

          <article className={styles.summaryCard}>
            <p>Next irrigation</p>
            <h2>
              {derived.nextFarm
                ? (derived.nextFarm.last_alert?.stress_mode ? "Urgent" : "Planned")
                : "No data"}
            </h2>
            <small>
              {derived.nextFarm
                ? `${derived.nextFarm.farm.farmer_name || "Unnamed farm"} - ${fmtOneDecimal(derived.nextFarm.last_alert?.litres_per_tree || 0)} L/tree`
                : "Run calculations to generate recommendations"}
            </small>
          </article>
        </section>

        <section className={styles.contentGrid}>
          <article className={styles.panelLarge}>
            <div className={styles.panelHeader}>
              <h3>Farm list</h3>
              <button className={styles.refreshBtn} onClick={() => void loadDashboard()} disabled={loading}>
                {loading ? "Refreshing..." : "Refresh"}
              </button>
            </div>

            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Farm</th>
                    <th>Trees</th>
                    <th>Soil</th>
                    <th>Status</th>
                    <th>Last rec.</th>
                  </tr>
                </thead>
                <tbody>
                  {farmDetails.length === 0 && (
                    <tr>
                      <td colSpan={5}>No farms found yet. Create one from the New farm button.</td>
                    </tr>
                  )}

                  {farmDetails.map((item) => {
                    const stress = item.last_alert?.stress_mode;
                    const statusLabel = stress ? "High stress" : "Stable";
                    const statusClass = stress ? styles.badgeHigh : styles.badgeOk;

                    return (
                      <tr key={item.farm.id}>
                        <td>{item.farm.farmer_name || "Unnamed farm"}</td>
                        <td>{fmtNumber(item.farm.tree_count || 0)}</td>
                        <td>{item.farm.soil_type || "-"}</td>
                        <td>
                          <span className={`${styles.badge} ${statusClass}`}>{statusLabel}</span>
                        </td>
                        <td>
                          {item.last_alert
                            ? `${fmtOneDecimal(item.last_alert.litres_per_tree)} L/tree`
                            : "No alerts"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>

          <aside className={styles.panelSide}>
            <h3>Action plan</h3>

            <div className={styles.actionsList}>
              {derived.actionPlan.length === 0 && (
                <p className={styles.muted}>No action items yet. Run irrigation calculations to populate this panel.</p>
              )}

              {derived.actionPlan.map((item) => {
                const urgent = item.last_alert?.stress_mode;
                return (
                  <article className={styles.actionItem} key={item.farm.id}>
                    <span className={urgent ? styles.tagUrgent : styles.tagNormal}>
                      {urgent ? "Urgent" : "Monitor"}
                    </span>
                    <h4>{item.farm.farmer_name || "Unnamed farm"}</h4>
                    <p>{fmtOneDecimal(item.last_alert?.litres_per_tree || 0)} L/tree recommended</p>
                  </article>
                );
              })}
            </div>

            <div className={styles.quickLinks}>
              <Link href="/farms/new">Add a farm</Link>
              <Link href="/auth/me">Manage account</Link>
            </div>
          </aside>
        </section>

        <section className={styles.trendPanel}>
          <div className={styles.panelHeader}>
            <h3>7-point irrigation trend (L/tree)</h3>
            <small>Derived from latest farm recommendations</small>
          </div>

          <div className={styles.chart}>
            {derived.trendValues.length === 0 && <p className={styles.muted}>No chart data yet.</p>}

            {derived.trendValues.map((value, index) => {
              const height = Math.max((value / derived.maxTrend) * 100, 12);
              const hClass = barHeightClass(height, styles as unknown as Record<string, string>);
              return (
                <div className={styles.barCol} key={`${value}-${index}`}>
                  <div className={`${styles.bar} ${hClass}`}></div>
                  <span>P{index + 1}</span>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}
