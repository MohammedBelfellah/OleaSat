"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import styles from "./page.module.css";
import {
  ApiError,
  type AdminDashboardResponse,
  fetchAdminDashboard,
  fetchAdminFarmers,
  type FarmListItem,
  triggerWeeklyJob,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

function toError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.detail} (HTTP ${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected admin error";
}

function fmt(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

export default function AdminPage() {
  const [loading, setLoading] = useState(true);
  const [triggering, setTriggering] = useState(false);
  const [dashboard, setDashboard] = useState<AdminDashboardResponse | null>(null);
  const [farmers, setFarmers] = useState<FarmListItem[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function loadAdmin() {
    setLoading(true);
    setErrorMessage(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const [adminDashboard, adminFarmers] = await Promise.all([
        fetchAdminDashboard(token),
        fetchAdminFarmers(token),
      ]);

      setDashboard(adminDashboard);
      setFarmers(adminFarmers);
    } catch (error) {
      setErrorMessage(toError(error));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadAdmin();
  }, []);

  async function onTriggerWeekly() {
    setTriggering(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const result = await triggerWeeklyJob(token);
      setSuccessMessage(result.message);
      await loadAdmin();
    } catch (error) {
      setErrorMessage(toError(error));
    } finally {
      setTriggering(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.kicker}>Admin</p>
            <h1>System operations center</h1>
            <p className={styles.sub}>Global metrics, urgent farms, recent alerts, and weekly trigger control.</p>
          </div>
          <div className={styles.links}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/farms">Farms</Link>
            <Link href="/analysis">Analysis</Link>
            <Link href="/feedback">Feedback</Link>
          </div>
        </header>

        {errorMessage && <p className={styles.error}>{errorMessage}</p>}
        {successMessage && <p className={styles.success}>{successMessage}</p>}

        <section className={styles.summaryGrid}>
          <article><span>Total farmers</span><strong>{fmt(dashboard?.total_farmers || 0)}</strong></article>
          <article><span>Active farmers</span><strong>{fmt(dashboard?.active_farmers || 0)}</strong></article>
          <article><span>Total alerts</span><strong>{fmt(dashboard?.total_alerts || 0)}</strong></article>
          <article><span>Alerts this week</span><strong>{fmt(dashboard?.alerts_this_week || 0)}</strong></article>
          <article><span>Farmers with Telegram</span><strong>{fmt(dashboard?.farmers_with_telegram || 0)}</strong></article>
          <article><span>Total water m3</span><strong>{fmt(dashboard?.total_water_m3 || 0)}</strong></article>
          <article><span>Avg litres/tree</span><strong>{fmt(dashboard?.avg_litres_per_tree || 0)}</strong></article>
          <article><span>Stress alerts</span><strong>{fmt(dashboard?.stress_alerts_count || 0)}</strong></article>
        </section>

        <section className={styles.actionsRow}>
          <button className={styles.primary} onClick={onTriggerWeekly} disabled={triggering || loading}>
            {triggering ? "Triggering..." : "Trigger weekly job now"}
          </button>
          <button className={styles.secondary} onClick={() => void loadAdmin()} disabled={loading}>
            {loading ? "Refreshing..." : "Refresh admin data"}
          </button>
        </section>

        <section className={styles.grid}>
          <article className={styles.card}>
            <h3>Urgent farms</h3>
            <div className={styles.list}>
              {(dashboard?.urgent_farms || []).map((farm) => (
                <div className={styles.item} key={farm.id}>
                  <strong>{farm.farmer_name || "Unnamed farm"}</strong>
                  <span>{farm.tree_count || 0} trees - {farm.soil_type || "-"}</span>
                </div>
              ))}
              {dashboard && dashboard.urgent_farms.length === 0 && <p className={styles.empty}>No urgent farms right now.</p>}
            </div>
          </article>

          <article className={styles.card}>
            <h3>Recent alerts</h3>
            <div className={styles.list}>
              {(dashboard?.recent_alerts || []).map((alert) => (
                <div className={styles.item} key={alert.id}>
                  <strong>{alert.farmer_name}</strong>
                  <span>{fmt(alert.litres_per_tree)} L/tree - {alert.stress_mode ? "Stress" : "Normal"}</span>
                  <small>{fmtDate(alert.sent_at)}</small>
                </div>
              ))}
              {dashboard && dashboard.recent_alerts.length === 0 && <p className={styles.empty}>No recent alerts.</p>}
            </div>
          </article>
        </section>

        <section className={styles.card}>
          <h3>All farmers (admin)</h3>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Phone</th>
                  <th>Trees</th>
                  <th>Soil</th>
                  <th>Telegram</th>
                </tr>
              </thead>
              <tbody>
                {farmers.map((farmer) => (
                  <tr key={farmer.id}>
                    <td>{farmer.farmer_name || "Unnamed"}</td>
                    <td>{farmer.phone || "-"}</td>
                    <td>{farmer.tree_count || 0}</td>
                    <td>{farmer.soil_type || "-"}</td>
                    <td>{farmer.telegram_linked ? "Linked" : "Not linked"}</td>
                  </tr>
                ))}
                {!loading && farmers.length === 0 && (
                  <tr>
                    <td colSpan={5}>No farmers found.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
