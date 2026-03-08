"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import styles from "./page.module.css";
import {
  ApiError,
  type AlertSnapshot,
  type CalculateResponse,
  type FarmListItem,
  type WaterStressMapResponse,
  calculateIrrigation,
  fetchFarmWaterMap,
  fetchFarms,
  fetchLatestFarmAnalysis,
  fetchMetricsFarmer,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const WaterStressMap = dynamic(() => import("@/components/maps/WaterStressMap"), {
  ssr: false,
});

function fmt(value: number, digits = 1): string {
  return new Intl.NumberFormat("en-US", { maximumFractionDigits: digits }).format(value);
}

function fmtDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(isoDate));
}

function recommendationFromAlert(alert: AlertSnapshot): "URGENT" | "IRRIGATE" | "SKIP" {
  if (alert.stress_mode) {
    return "URGENT";
  }
  if (alert.litres_per_tree >= 25) {
    return "URGENT";
  }
  if (alert.litres_per_tree >= 10) {
    return "IRRIGATE";
  }
  return "SKIP";
}

function toAnalysisError(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.detail === "Invalid or expired token") {
      return "Session expired. Please login again.";
    }
    if (error.detail.includes("incomplete_profile")) {
      return "Farm profile is incomplete. Ensure polygon, tree age, soil type, and tree count are set.";
    }
    if (error.detail === "farmer_not_found") {
      return "Selected farm was not found.";
    }
    return `${error.detail} (HTTP ${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected analysis error";
}

export default function AnalysisPage() {
  const [loadingFarms, setLoadingFarms] = useState(true);
  const [loadingLatest, setLoadingLatest] = useState(false);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [running, setRunning] = useState(false);

  const [farms, setFarms] = useState<FarmListItem[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState("");
  const [gridSize, setGridSize] = useState("20");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  const [calculateResult, setCalculateResult] = useState<CalculateResponse | null>(null);
  const [waterMap, setWaterMap] = useState<WaterStressMapResponse | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<AlertSnapshot[]>([]);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadFarms = useCallback(async (signal?: AbortSignal) => {
    setLoadingFarms(true);

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("No token found. Login first to run analysis.");
      }

      const list = await fetchFarms(token, signal);
      setFarms(list);
      if (list.length > 0) {
        setSelectedFarmId((prev) => prev || list[0].id);
      }
    } catch (error) {
      setErrorMessage(toAnalysisError(error));
    } finally {
      setLoadingFarms(false);
    }
  }, []);

  const loadLatestSaved = useCallback(async (farmId: string, signal?: AbortSignal) => {
    if (!farmId) {
      setCalculateResult(null);
      setWaterMap(null);
      return;
    }

    setLoadingLatest(true);
    setErrorMessage(null);

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("No token found. Login first to view analysis.");
      }

      const latestAnalysis = await fetchLatestFarmAnalysis(token, farmId, signal);
      setCalculateResult(latestAnalysis.analysis);

      const latestMap = await fetchFarmWaterMap(token, farmId, undefined, signal);
      setWaterMap(latestMap);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.detail === "no_saved_analysis") {
        setCalculateResult(null);
        setWaterMap(null);
        return;
      }
      setErrorMessage(toAnalysisError(error));
    } finally {
      setLoadingLatest(false);
    }
  }, []);

  const loadAnalysisHistory = useCallback(async (farmId: string, signal?: AbortSignal) => {
    if (!farmId) {
      setAnalysisHistory([]);
      return;
    }

    setLoadingHistory(true);

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("No token found. Login first to view analysis history.");
      }

      const metrics = await fetchMetricsFarmer(token, farmId, signal);
      setAnalysisHistory(metrics.alerts || []);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404 && error.detail === "farmer_not_found") {
        setAnalysisHistory([]);
        return;
      }
      setErrorMessage(toAnalysisError(error));
    } finally {
      setLoadingHistory(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void loadFarms(controller.signal);
    }, 0);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, [loadFarms]);

  useEffect(() => {
    const controller = new AbortController();
    void loadLatestSaved(selectedFarmId, controller.signal);
    void loadAnalysisHistory(selectedFarmId, controller.signal);
    return () => controller.abort();
  }, [selectedFarmId, loadAnalysisHistory, loadLatestSaved]);

  async function onRunAnalysis(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    setRunning(true);

    try {
      const token = getAccessToken();
      if (!token) {
        throw new Error("No token found. Login first to run analysis.");
      }
      if (!selectedFarmId) {
        throw new Error("Please select a farm first.");
      }

      const query = {
        grid_size: Number(gridSize),
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        force_refresh: true,
      };

      const [calc, water] = await Promise.all([
        calculateIrrigation(token, selectedFarmId, { forceRefresh: true }),
        fetchFarmWaterMap(token, selectedFarmId, query),
      ]);

      setCalculateResult(calc);
      setWaterMap(water);
      await loadAnalysisHistory(selectedFarmId);
    } catch (error) {
      setErrorMessage(toAnalysisError(error));
    } finally {
      setRunning(false);
    }
  }

  const selectedFarm = farms.find((farm) => farm.id === selectedFarmId) || null;

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.kicker}>Irrigation Analysis</p>
            <h1>Action recommendation</h1>
            <p className={styles.sub}>Run satellite + FAO-56 analysis for a farm and inspect spatial stress cells.</p>
          </div>

          <div className={styles.topLinks}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/farms/new">New farm</Link>
          </div>
        </header>

        <form className={styles.controls} onSubmit={onRunAnalysis}>
          <div className={styles.field}>
            <label htmlFor="farm-select">Farm</label>
            <select
              id="farm-select"
              value={selectedFarmId}
              onChange={(event) => setSelectedFarmId(event.target.value)}
              disabled={loadingFarms || farms.length === 0}
              required
            >
              {farms.length === 0 && <option value="">No farms available</option>}
              {farms.map((farm) => (
                <option key={farm.id} value={farm.id}>
                  {farm.farmer_name || "Unnamed farm"}
                </option>
              ))}
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="grid-size">Grid size</label>
            <select id="grid-size" value={gridSize} onChange={(event) => setGridSize(event.target.value)}>
              <option value="12">12</option>
              <option value="16">16</option>
              <option value="20">20</option>
              <option value="24">24</option>
              <option value="30">30</option>
            </select>
          </div>

          <div className={styles.field}>
            <label htmlFor="start-date">Start date</label>
            <input id="start-date" type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
          </div>

          <div className={styles.field}>
            <label htmlFor="end-date">End date</label>
            <input id="end-date" type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
          </div>

          <button className={styles.runButton} type="submit" disabled={running || loadingFarms || !selectedFarmId}>
            {running ? "Running analysis..." : "Run new analysis"}
          </button>
        </form>

        {errorMessage && <p className={styles.error}>{errorMessage}</p>}

        <section className={styles.mainGrid}>
          <article className={styles.heroCard}>
            <p className={styles.miniKicker}>Analysis output</p>
            <h2>
              {calculateResult
                ? `${calculateResult.recommendation}: ${fmt(calculateResult.litres_per_tree, 2)} Litres/Tree`
                : loadingLatest
                  ? "Loading latest saved analysis..."
                  : "No saved analysis yet. Click Run new analysis."}
            </h2>
            <p>
              {calculateResult
                ? calculateResult.explanation
                : "The recommendation will use NDVI/NDMI, weekly ET0 and rainfall, and farm parameters."}
            </p>

            <div className={styles.heroStats}>
              <div>
                <span>Total volume</span>
                <strong>{calculateResult ? `${fmt(calculateResult.total_m3, 2)} m3` : "-"}</strong>
              </div>
              <div>
                <span>Confidence source</span>
                <strong>{calculateResult?.source || "-"}</strong>
              </div>
              <div>
                <span>Cloud %</span>
                <strong>{calculateResult ? `${fmt(calculateResult.cloud_pct, 1)}%` : "-"}</strong>
              </div>
              <div>
                <span>Data mode</span>
                <strong>{calculateResult?.from_cache ? "Saved" : calculateResult ? "Fresh" : "-"}</strong>
              </div>
            </div>
          </article>

          <aside className={styles.sideCard}>
            <h3>Context</h3>
            <div className={styles.sideList}>
              <p>
                <span>Farm:</span> {selectedFarm?.farmer_name || "-"}
              </p>
              <p>
                <span>Trees:</span> {selectedFarm?.tree_count || "-"}
              </p>
              <p>
                <span>Soil:</span> {selectedFarm?.soil_type || "-"}
              </p>
              <p>
                <span>Phase:</span> {calculateResult?.phase_label || "-"}
              </p>
              <p>
                <span>NDVI:</span> {calculateResult ? fmt(calculateResult.ndvi_current, 2) : "-"}
              </p>
              <p>
                <span>NDMI:</span> {calculateResult ? fmt(calculateResult.ndmi_current, 2) : "-"}
              </p>
            </div>
          </aside>
        </section>

        <section className={styles.historySection}>
          <header className={styles.historyHeader}>
            <h3>Past analyses</h3>
            <p>
              {loadingHistory
                ? "Loading analysis history..."
                : `${analysisHistory.length} saved run${analysisHistory.length === 1 ? "" : "s"}`}
            </p>
          </header>

          {analysisHistory.length === 0 ? (
            <p className={styles.historyEmpty}>
              No past analyses yet. Click <strong>Run new analysis</strong> to create your first record.
            </p>
          ) : (
            <div className={styles.historyList}>
              {analysisHistory.map((entry) => {
                const recommendation = recommendationFromAlert(entry);
                const recommendationClass =
                  recommendation === "URGENT"
                    ? styles.badgeUrgent
                    : recommendation === "IRRIGATE"
                      ? styles.badgeIrrigate
                      : styles.badgeSkip;

                return (
                  <article className={styles.historyRow} key={entry.id}>
                    <div className={styles.historyDate}>{fmtDate(entry.sent_at)}</div>
                    <div className={`${styles.historyBadge} ${recommendationClass}`}>{recommendation}</div>
                    <div className={styles.historyMetric}>
                      <span>Litres/tree</span>
                      <strong>{fmt(entry.litres_per_tree, 2)}</strong>
                    </div>
                    <div className={styles.historyMetric}>
                      <span>Total m3</span>
                      <strong>{fmt(entry.total_litres / 1000, 2)}</strong>
                    </div>
                    <div className={styles.historyMetric}>
                      <span>NDMI</span>
                      <strong>{entry.ndmi_current !== null && entry.ndmi_current !== undefined ? fmt(entry.ndmi_current, 3) : "-"}</strong>
                    </div>
                    <div className={styles.historyMetric}>
                      <span>NDVI</span>
                      <strong>{entry.ndvi_current !== null && entry.ndvi_current !== undefined ? fmt(entry.ndvi_current, 3) : "-"}</strong>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className={styles.mapSection}>
          <header className={styles.mapHeader}>
            <h3>Water stress map</h3>
            <p>
              {waterMap
                ? `${waterMap.summary.cells_in_polygon} cells in polygon, ${waterMap.summary.high_stress_cells} high-stress`
                : loadingLatest
                  ? "Loading latest saved map..."
                  : "Run analysis to render stress map"}
            </p>
          </header>

          <div className={styles.mapGrid}>
            <div className={styles.mapPane}>
              <WaterStressMap cells={waterMap?.cells || []} className={styles.mapLeaflet} />
            </div>

            <aside className={styles.legendPane}>
              <h4>Legend</h4>
              <ul>
                <li>
                  <span className={`${styles.dot} ${styles.dotHigh}`}></span>High stress
                </li>
                <li>
                  <span className={`${styles.dot} ${styles.dotMedium}`}></span>Medium stress
                </li>
                <li>
                  <span className={`${styles.dot} ${styles.dotLow}`}></span>Low stress
                </li>
              </ul>

              <div className={styles.legendStats}>
                <p>
                  <span>Avg NDVI:</span> {waterMap ? fmt(waterMap.summary.avg_ndvi, 2) : "-"}
                </p>
                <p>
                  <span>Avg NDMI:</span> {waterMap ? fmt(waterMap.summary.avg_ndmi, 2) : "-"}
                </p>
                <p>
                  <span>Avg stress:</span> {waterMap ? fmt(waterMap.summary.avg_stress_score, 2) : "-"}
                </p>
              </div>
            </aside>
          </div>
        </section>
      </div>
    </div>
  );
}
