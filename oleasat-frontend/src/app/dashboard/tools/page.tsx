"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

import styles from "../../tools/page.module.css";
import {
  analyzeDirect,
  ApiError,
  fetchSatelliteIndices,
  type AnalyzeResponse,
  type SatelliteIndicesResponse,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

const DEFAULT_POLYGON = [
  [-5.55, 33.89],
  [-5.54, 33.89],
  [-5.54, 33.88],
  [-5.55, 33.88],
];

function toError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.detail} (HTTP ${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected tools error";
}

export default function DashboardToolsPage() {
  const [polygonText, setPolygonText] = useState(JSON.stringify(DEFAULT_POLYGON, null, 2));
  const [farmId, setFarmId] = useState("sandbox-farm");
  const [treeCount, setTreeCount] = useState("120");
  const [treeAge, setTreeAge] = useState("ADULT");
  const [soilType, setSoilType] = useState("MEDIUM");
  const [spacingM2, setSpacingM2] = useState("100");
  const [efficiency, setEfficiency] = useState("0.9");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [cloud, setCloud] = useState("20");

  const [runningAnalyze, setRunningAnalyze] = useState(false);
  const [runningSatellite, setRunningSatellite] = useState(false);
  const [analyzeResult, setAnalyzeResult] = useState<AnalyzeResponse | null>(null);
  const [satResult, setSatResult] = useState<SatelliteIndicesResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  function parsePolygon() {
    const parsed = JSON.parse(polygonText) as unknown;
    if (!Array.isArray(parsed)) {
      throw new Error("Polygon must be a JSON array");
    }
    return parsed as number[][];
  }

  async function runAnalyze(event: FormEvent) {
    event.preventDefault();
    setRunningAnalyze(true);
    setErrorMessage(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const polygon = parsePolygon();
      const result = await analyzeDirect(token, {
        farm_id: farmId,
        polygon,
        tree_count: Number(treeCount),
        tree_age: treeAge as "YOUNG" | "ADULT",
        soil_type: soilType as "SANDY" | "MEDIUM" | "CLAY",
        spacing_m2: Number(spacingM2),
        irrigation_efficiency: Number(efficiency),
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        max_cloud_pct: Number(cloud),
      });
      setAnalyzeResult(result);
    } catch (error) {
      setErrorMessage(toError(error));
    } finally {
      setRunningAnalyze(false);
    }
  }

  async function runSatellite() {
    setRunningSatellite(true);
    setErrorMessage(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const polygon = parsePolygon();
      const result = await fetchSatelliteIndices(token, {
        polygon,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        max_cloud_pct: Number(cloud),
      });
      setSatResult(result);
    } catch (error) {
      setErrorMessage(toError(error));
    } finally {
      setRunningSatellite(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.kicker}>Developer Tools</p>
            <h1>Direct analyze and satellite endpoints</h1>
            <p className={styles.sub}>Use this page to test `POST /analyze` and `POST /satellite/indices` directly.</p>
          </div>
          <div className={styles.links}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/dashboard?view=farms">Farms workspace</Link>
            <Link href="/dashboard/analysis">Analysis</Link>
            <Link href="/dashboard?view=feedback">Feedback</Link>
          </div>
        </header>

        {errorMessage && <p className={styles.error}>{errorMessage}</p>}

        <section className={styles.grid}>
          <article className={styles.card}>
            <h3>Request input</h3>
            <form className={styles.form} onSubmit={runAnalyze}>
              <label>
                Farm id
                <input value={farmId} onChange={(e) => setFarmId(e.target.value)} />
              </label>
              <label>
                Polygon JSON
                <textarea rows={8} value={polygonText} onChange={(e) => setPolygonText(e.target.value)} />
              </label>
              <div className={styles.row}>
                <label>
                  Tree count
                  <input type="number" value={treeCount} onChange={(e) => setTreeCount(e.target.value)} />
                </label>
                <label>
                  Spacing m2
                  <input type="number" value={spacingM2} onChange={(e) => setSpacingM2(e.target.value)} />
                </label>
              </div>
              <div className={styles.row}>
                <label>
                  Tree age
                  <select value={treeAge} onChange={(e) => setTreeAge(e.target.value)}>
                    <option value="YOUNG">YOUNG</option>
                    <option value="ADULT">ADULT</option>
                  </select>
                </label>
                <label>
                  Soil type
                  <select value={soilType} onChange={(e) => setSoilType(e.target.value)}>
                    <option value="SANDY">SANDY</option>
                    <option value="MEDIUM">MEDIUM</option>
                    <option value="CLAY">CLAY</option>
                  </select>
                </label>
              </div>
              <div className={styles.row}>
                <label>
                  Efficiency
                  <input type="number" step="0.01" min={0.5} max={1} value={efficiency} onChange={(e) => setEfficiency(e.target.value)} />
                </label>
                <label>
                  Max cloud %
                  <input type="number" min={0} max={100} value={cloud} onChange={(e) => setCloud(e.target.value)} />
                </label>
              </div>
              <div className={styles.row}>
                <label>
                  Start date
                  <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </label>
                <label>
                  End date
                  <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </label>
              </div>
              <div className={styles.actions}>
                <button className={styles.primary} type="submit" disabled={runningAnalyze}>
                  {runningAnalyze ? "Running analyze..." : "Run /analyze"}
                </button>
                <button className={styles.secondary} type="button" onClick={() => void runSatellite()} disabled={runningSatellite}>
                  {runningSatellite ? "Running satellite..." : "Run /satellite/indices"}
                </button>
              </div>
            </form>
          </article>

          <article className={styles.card}>
            <h3>Analyze result</h3>
            <pre className={styles.code}>{analyzeResult ? JSON.stringify(analyzeResult, null, 2) : "No analyze result yet."}</pre>

            <h3 className={styles.blockTitle}>Satellite result</h3>
            <pre className={styles.code}>{satResult ? JSON.stringify(satResult, null, 2) : "No satellite result yet."}</pre>
          </article>
        </section>
      </div>
    </div>
  );
}
