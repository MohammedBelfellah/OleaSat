"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import styles from "./page.module.css";
import {
  ApiError,
  deleteFarm,
  type FarmDetailResponse,
  type FarmListItem,
  fetchFarmDetail,
  fetchFarms,
  fetchTelegramLink,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.detail} (HTTP ${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected farms error";
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "-";
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

function fmt(value: number): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(value);
}

export default function FarmsPage() {
  const [loading, setLoading] = useState(true);
  const [farms, setFarms] = useState<FarmListItem[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState("");
  const [detail, setDetail] = useState<FarmDetailResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [telegramMessage, setTelegramMessage] = useState<string | null>(null);
  const [busyDelete, setBusyDelete] = useState(false);

  const loadFarms = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("No token found. Please login first.");
      }

      const list = await fetchFarms(token);
      setFarms(list);
      if (!selectedFarmId || !list.find((farm) => farm.id === selectedFarmId)) {
        setSelectedFarmId(list[0]?.id || "");
      }
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [selectedFarmId]);

  async function loadDetail(farmId: string) {
    if (!farmId) {
      setDetail(null);
      return;
    }

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("No token found. Please login first.");
      }

      const farmDetail = await fetchFarmDetail(token, farmId);
      setDetail(farmDetail);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  useEffect(() => {
    void loadFarms();
  }, [loadFarms]);

  useEffect(() => {
    void loadDetail(selectedFarmId);
  }, [selectedFarmId]);

  async function onOpenTelegramLink() {
    setTelegramMessage(null);
    if (!selectedFarmId) return;

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("No token found. Please login first.");
      }

      const link = await fetchTelegramLink(token, selectedFarmId);
      setTelegramMessage(link.linked ? "Telegram already linked. Opening chat..." : "Telegram link ready. Opening chat...");
      window.open(link.telegram_link, "_blank", "noopener,noreferrer");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    }
  }

  async function onDeleteFarm() {
    if (!selectedFarmId) return;
    const confirmed = window.confirm("Delete this farm and all its alert history?");
    if (!confirmed) return;

    setBusyDelete(true);
    setTelegramMessage(null);
    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("No token found. Please login first.");
      }

      await deleteFarm(token, selectedFarmId);
      setTelegramMessage("Farm deleted successfully.");
      await loadFarms();
      setDetail(null);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setBusyDelete(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.kicker}>Farm Registry</p>
            <h1>Manage your farms</h1>
            <p className={styles.sub}>View details, open Telegram link, and remove farms safely.</p>
          </div>
          <div className={styles.links}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/dashboard?view=farms">Add farm workspace</Link>
            <Link href="/analysis">Analysis</Link>
            <Link href="/feedback">Feedback</Link>
            <Link href="/tools">Tools</Link>
          </div>
        </header>

        {errorMessage && <p className={styles.error}>{errorMessage}</p>}
        {telegramMessage && <p className={styles.success}>{telegramMessage}</p>}

        <section className={styles.layout}>
          <aside className={styles.listPanel}>
            <div className={styles.panelHeader}>
              <h3>Farms</h3>
              <button onClick={() => void loadFarms()} disabled={loading}>
                {loading ? "Loading..." : "Refresh"}
              </button>
            </div>

            {farms.length === 0 && <p className={styles.empty}>No farms yet. Create one from the New farm page.</p>}

            <div className={styles.list}>
              {farms.map((farm) => (
                <button
                  key={farm.id}
                  className={farm.id === selectedFarmId ? `${styles.item} ${styles.itemActive}` : styles.item}
                  onClick={() => setSelectedFarmId(farm.id)}
                >
                  <strong>{farm.farmer_name || "Unnamed farm"}</strong>
                  <span>{farm.tree_count || 0} trees - {farm.soil_type || "-"}</span>
                  <small>Updated: {fmtDate(farm.last_alert_at)}</small>
                </button>
              ))}
            </div>
          </aside>

          <article className={styles.detailPanel}>
            <h3>Farm details</h3>
            {!detail && <p className={styles.empty}>Select a farm to view details.</p>}

            {detail && (
              <>
                <div className={styles.grid}>
                  <div>
                    <span>Name</span>
                    <strong>{detail.farm.farmer_name || "-"}</strong>
                  </div>
                  <div>
                    <span>Phone</span>
                    <strong>{detail.farm.phone || "-"}</strong>
                  </div>
                  <div>
                    <span>State</span>
                    <strong>{detail.farm.state || "-"}</strong>
                  </div>
                  <div>
                    <span>Trees</span>
                    <strong>{detail.farm.tree_count || 0}</strong>
                  </div>
                  <div>
                    <span>Spacing m2</span>
                    <strong>{detail.farm.spacing_m2 || 0}</strong>
                  </div>
                  <div>
                    <span>Irrigation efficiency</span>
                    <strong>{detail.farm.irrigation_efficiency || 0}</strong>
                  </div>
                </div>

                <div className={styles.lastAlert}>
                  <h4>Last recommendation</h4>
                  {!detail.last_alert && <p className={styles.empty}>No alert history yet.</p>}
                  {detail.last_alert && (
                    <div className={styles.alertGrid}>
                      <div>
                        <span>Sent at</span>
                        <strong>{fmtDate(detail.last_alert.sent_at)}</strong>
                      </div>
                      <div>
                        <span>Litres/tree</span>
                        <strong>{fmt(detail.last_alert.litres_per_tree)} L</strong>
                      </div>
                      <div>
                        <span>Total m3</span>
                        <strong>{fmt((detail.last_alert.total_litres || 0) / 1000)} m3</strong>
                      </div>
                      <div>
                        <span>NDMI</span>
                        <strong>{detail.last_alert.ndmi_current ?? "-"}</strong>
                      </div>
                    </div>
                  )}
                </div>

                <div className={styles.actions}>
                  <button className={styles.primary} onClick={onOpenTelegramLink}>Open Telegram link</button>
                  <button className={styles.danger} onClick={onDeleteFarm} disabled={busyDelete}>
                    {busyDelete ? "Deleting..." : "Delete farm"}
                  </button>
                </div>
              </>
            )}
          </article>
        </section>
      </div>
    </div>
  );
}
