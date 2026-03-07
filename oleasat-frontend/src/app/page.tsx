"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./page.module.css";
import { API_BASE_URL, type HealthResponse, fetchHealth } from "@/lib/api";

type FetchState = "idle" | "loading" | "ok" | "error";

export default function Home() {
  const [state, setState] = useState<FetchState>("idle");
  const [data, setData] = useState<HealthResponse | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastCheckedAt, setLastCheckedAt] = useState<Date | null>(null);

  async function runHealthCheck(signal?: AbortSignal) {
    setState("loading");
    setErrorMessage(null);

    try {
      const result = await fetchHealth(signal);
      setData(result);
      setState("ok");
      setLastCheckedAt(new Date());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown network error";
      setState("error");
      setErrorMessage(message);
      setLastCheckedAt(new Date());
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => {
      void runHealthCheck(controller.signal);
    }, 0);

    return () => {
      controller.abort();
      window.clearTimeout(timeoutId);
    };
  }, []);

  const statusLabel = useMemo(() => {
    if (state === "loading") return "Checking backend";
    if (state === "ok") return "Backend reachable";
    if (state === "error") return "Connection failed";
    return "Not checked yet";
  }, [state]);

  return (
    <div className={styles.page}>
      <main className={styles.shell}>
        <header className={styles.header}>
          <p className={styles.kicker}>OleaSat Frontend</p>
          <h1>Step 1: Backend Connectivity</h1>
          <p className={styles.subtitle}>
            Before we build auth and dashboards, we verify the Next.js app can call your FastAPI backend.
          </p>
        </header>

        <section className={styles.card}>
          <div className={styles.row}>
            <span className={styles.label}>Status</span>
            <span className={`${styles.badge} ${styles[state]}`}>{statusLabel}</span>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>API base URL</span>
            <code className={styles.value}>{API_BASE_URL}</code>
          </div>

          <div className={styles.row}>
            <span className={styles.label}>`GET /health` response</span>
            <code className={styles.value}>
              {data ? JSON.stringify(data) : "No data yet"}
            </code>
          </div>

          {errorMessage && <p className={styles.error}>{errorMessage}</p>}

          <button
            className={styles.button}
            onClick={() => {
              void runHealthCheck();
            }}
            disabled={state === "loading"}
            type="button"
          >
            {state === "loading" ? "Checking..." : "Retry health check"}
          </button>

          {lastCheckedAt && (
            <p className={styles.timestamp}>
              Last check: {lastCheckedAt.toLocaleString()}
            </p>
          )}
        </section>

        <section className={styles.nextStep}>
          <h2>Step 2: Auth pages are ready</h2>
          <p>Open the authentication flow and test it against your backend:</p>
          <div className={styles.linkRow}>
            <Link className={styles.linkPill} href="/auth/register">
              Register
            </Link>
            <Link className={styles.linkPill} href="/auth/login">
              Login
            </Link>
            <Link className={styles.linkPill} href="/auth/me">
              Current User (/auth/me)
            </Link>
          </div>
        </section>
      </main>
    </div>
  );
}
