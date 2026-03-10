"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";

import styles from "./page.module.css";
import {
  ApiError,
  type FeedbackType,
  fetchFarms,
  fetchFeedbackSummary,
  fetchMetricsFarmer,
  submitFeedback,
  type FarmListItem,
  type MetricsFarmerResponse,
} from "@/lib/api";
import { getAccessToken } from "@/lib/auth";

function toError(error: unknown): string {
  if (error instanceof ApiError) {
    return `${error.detail} (HTTP ${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected feedback error";
}

function fmtDate(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
}

const FEEDBACK_TYPES: FeedbackType[] = ["WORKED", "TOO_MUCH", "TOO_LITTLE", "NOT_APPLIED"];

export default function FeedbackPage() {
  const [loading, setLoading] = useState(true);
  const [farms, setFarms] = useState<FarmListItem[]>([]);
  const [selectedFarmId, setSelectedFarmId] = useState("");
  const [history, setHistory] = useState<MetricsFarmerResponse | null>(null);
  const [summary, setSummary] = useState<Awaited<ReturnType<typeof fetchFeedbackSummary>> | null>(null);
  const [feedbackType, setFeedbackType] = useState<FeedbackType>("WORKED");
  const [rating, setRating] = useState("5");
  const [comment, setComment] = useState("");
  const [alertId, setAlertId] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadFarms = useCallback(async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const list = await fetchFarms(token);
      setFarms(list);
      if (!selectedFarmId || !list.find((farm) => farm.id === selectedFarmId)) {
        setSelectedFarmId(list[0]?.id || "");
      }
    } catch (error) {
      setErrorMessage(toError(error));
    } finally {
      setLoading(false);
    }
  }, [selectedFarmId]);

  async function loadFeedbackData(farmId: string) {
    if (!farmId) {
      setSummary(null);
      setHistory(null);
      return;
    }

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      const [feedbackSummary, metricHistory] = await Promise.all([
        fetchFeedbackSummary(token, farmId),
        fetchMetricsFarmer(token, farmId),
      ]);

      setSummary(feedbackSummary);
      setHistory(metricHistory);
      setAlertId(metricHistory.alerts[0]?.id || "");
    } catch (error) {
      setErrorMessage(toError(error));
    }
  }

  useEffect(() => {
    void loadFarms();
  }, [loadFarms]);

  useEffect(() => {
    void loadFeedbackData(selectedFarmId);
  }, [selectedFarmId]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedFarmId) return;

    setSubmitting(true);
    setErrorMessage(null);
    setSuccess(null);

    try {
      const token = getAccessToken();
      if (!token) throw new Error("No token found. Login first.");

      await submitFeedback(token, {
        farmer_id: selectedFarmId,
        alert_id: alertId || undefined,
        feedback_type: feedbackType,
        rating: rating ? Number(rating) : undefined,
        comment: comment.trim() || undefined,
      });

      setSuccess("Feedback submitted.");
      setComment("");
      await loadFeedbackData(selectedFarmId);
    } catch (error) {
      setErrorMessage(toError(error));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.shell}>
        <header className={styles.topbar}>
          <div>
            <p className={styles.kicker}>Feedback Loop</p>
            <h1>Recommendation feedback</h1>
            <p className={styles.sub}>Submit field outcome and review historical feedback quality.</p>
          </div>
          <div className={styles.links}>
            <Link href="/dashboard">Dashboard</Link>
            <Link href="/analysis">Analysis</Link>
            <Link href="/farms">Farms</Link>
            <Link href="/tools">Tools</Link>
          </div>
        </header>

        {errorMessage && <p className={styles.error}>{errorMessage}</p>}
        {success && <p className={styles.success}>{success}</p>}

        <section className={styles.grid}>
          <article className={styles.card}>
            <h3>Submit feedback</h3>

            <form className={styles.form} onSubmit={onSubmit}>
              <label>
                Farm
                <select value={selectedFarmId} onChange={(e) => setSelectedFarmId(e.target.value)} disabled={loading}>
                  {farms.length === 0 && <option value="">No farms</option>}
                  {farms.map((farm) => (
                    <option key={farm.id} value={farm.id}>{farm.farmer_name || "Unnamed farm"}</option>
                  ))}
                </select>
              </label>

              <label>
                Alert (optional)
                <select value={alertId} onChange={(e) => setAlertId(e.target.value)}>
                  <option value="">None</option>
                  {(history?.alerts || []).slice(0, 20).map((alert) => (
                    <option key={alert.id} value={alert.id}>
                      {fmtDate(alert.sent_at)} - {alert.litres_per_tree.toFixed(1)} L/tree
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Outcome
                <select value={feedbackType} onChange={(e) => setFeedbackType(e.target.value as FeedbackType)}>
                  {FEEDBACK_TYPES.map((type) => (
                    <option key={type} value={type}>{type}</option>
                  ))}
                </select>
              </label>

              <label>
                Rating (1-5)
                <input type="number" min={1} max={5} value={rating} onChange={(e) => setRating(e.target.value)} />
              </label>

              <label>
                Comment
                <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={4} placeholder="What happened in the field?" />
              </label>

              <button className={styles.primary} type="submit" disabled={submitting || !selectedFarmId}>
                {submitting ? "Sending..." : "Send feedback"}
              </button>
            </form>
          </article>

          <article className={styles.card}>
            <h3>Summary</h3>
            {!summary && <p className={styles.empty}>Select a farm to load summary.</p>}
            {summary && (
              <div className={styles.summaryGrid}>
                <div><span>Total</span><strong>{summary.total_feedback}</strong></div>
                <div><span>Worked</span><strong>{summary.worked_count}</strong></div>
                <div><span>Too much</span><strong>{summary.too_much_count}</strong></div>
                <div><span>Too little</span><strong>{summary.too_little_count}</strong></div>
                <div><span>Not applied</span><strong>{summary.not_applied_count}</strong></div>
                <div><span>Avg rating</span><strong>{summary.avg_rating.toFixed(2)}</strong></div>
              </div>
            )}

            <h4 className={styles.historyTitle}>Recent feedback</h4>
            <div className={styles.historyList}>
              {(summary?.feedback || []).slice(0, 12).map((entry) => (
                <article className={styles.historyItem} key={entry.id}>
                  <strong>{entry.feedback_type}</strong>
                  <span>{entry.rating ? `${entry.rating}/5` : "No rating"}</span>
                  <small>{fmtDate(entry.created_at)}</small>
                  <p>{entry.comment || "No comment"}</p>
                </article>
              ))}
              {summary && summary.feedback.length === 0 && <p className={styles.empty}>No feedback yet.</p>}
            </div>
          </article>
        </section>
      </div>
    </div>
  );
}
