"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useCallback, useEffect, useState } from "react";

import styles from "../dashboard/page.module.css";
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
import { clearAccessToken, getAccessToken } from "@/lib/auth";

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

export default function FeedbackPage() {
  const router = useRouter();
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

  function onLogout() {
    clearAccessToken();
    router.push("/auth/login");
  }

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
              <Link className={styles.navLink} href="/dashboard/analysis">
                <span className={styles.navButtonLabel}>
                  <SidebarGlyph name="water" className={styles.navGlyph} />
                  <span>Analyze history</span>
                </span>
              </Link>
            </div>

            <div className={styles.navBottom}>
              <Link className={`${styles.navLink} ${styles.navLinkActive}`} href="/feedback">
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
                <h1>Feedback</h1>
                <p className={styles.sub}>Submit field outcome and review historical feedback quality.</p>
              </div>
            </header>

            {errorMessage && <p className={styles.error}>{errorMessage}</p>}
            {success && <p className={styles.successInline}>{success}</p>}

            <section className={styles.panel}>
              <h3>Submit feedback</h3>
              <form className={styles.feedbackComposer} onSubmit={onSubmit}>
                <label className={styles.fieldBlock}>
                  Farm
                  <select value={selectedFarmId} onChange={(event) => setSelectedFarmId(event.target.value)} disabled={loading}>
                    {farms.length === 0 && <option value="">No farms</option>}
                    {farms.map((farm) => (
                      <option key={farm.id} value={farm.id}>{farm.farmer_name || "Unnamed farm"}</option>
                    ))}
                  </select>
                </label>

                <label className={styles.fieldBlock}>
                  Alert (optional)
                  <select value={alertId} onChange={(event) => setAlertId(event.target.value)}>
                    <option value="">None</option>
                    {(history?.alerts || []).slice(0, 20).map((alert) => (
                      <option key={alert.id} value={alert.id}>
                        {fmtDate(alert.sent_at)} - {alert.litres_per_tree.toFixed(1)} L/tree
                      </option>
                    ))}
                  </select>
                </label>

                <div className={styles.analysisForm}>
                  <label className={styles.fieldBlock}>
                    Outcome
                    <select value={feedbackType} onChange={(event) => setFeedbackType(event.target.value as FeedbackType)}>
                      {FEEDBACK_TYPES.map((type) => (
                        <option key={type} value={type}>{type}</option>
                      ))}
                    </select>
                  </label>

                  <label className={styles.fieldBlock}>
                    Rating (1-5)
                    <input type="number" min={1} max={5} value={rating} onChange={(event) => setRating(event.target.value)} />
                  </label>
                </div>

                <label className={`${styles.fieldBlock} ${styles.fieldWide}`}>
                  Comment
                  <textarea
                    value={comment}
                    onChange={(event) => setComment(event.target.value)}
                    rows={4}
                    placeholder="What happened in the field?"
                  />
                </label>

                <div className={styles.inlineActions}>
                  <button className={styles.primaryBtn} type="submit" disabled={submitting || !selectedFarmId}>
                    {submitting ? "Sending..." : "Send feedback"}
                  </button>
                </div>
              </form>
            </section>

            <section className={styles.panel}>
              <h3>Summary</h3>

              {!summary && <p className={styles.muted}>Select a farm to load summary.</p>}

              {summary && (
                <>
                  <div className={styles.resultGrid}>
                    <div><span>Total</span><strong>{summary.total_feedback}</strong></div>
                    <div><span>Worked</span><strong>{summary.worked_count}</strong></div>
                    <div><span>Too much</span><strong>{summary.too_much_count}</strong></div>
                    <div><span>Too little</span><strong>{summary.too_little_count}</strong></div>
                    <div><span>Not applied</span><strong>{summary.not_applied_count}</strong></div>
                    <div><span>Avg rating</span><strong>{summary.avg_rating.toFixed(2)}</strong></div>
                  </div>

                  <div className={styles.tableWrap}>
                    <table className={styles.table}>
                      <thead>
                        <tr>
                          <th>Date</th>
                          <th>Type</th>
                          <th>Rating</th>
                          <th>Comment</th>
                        </tr>
                      </thead>
                      <tbody>
                        {summary.feedback.length === 0 && (
                          <tr>
                            <td colSpan={4}>No feedback yet.</td>
                          </tr>
                        )}
                        {summary.feedback.slice(0, 12).map((entry) => (
                          <tr key={entry.id}>
                            <td>{fmtDate(entry.created_at)}</td>
                            <td>{entry.feedback_type}</td>
                            <td>{entry.rating ? `${entry.rating}/5` : "-"}</td>
                            <td>{entry.comment || "No comment"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
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
