"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import styles from "../auth.module.css";
import { ApiError, authMe, type UserOut } from "@/lib/api";
import { clearAccessToken, getAccessToken } from "@/lib/auth";

function toMeErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    if (error.detail === "Invalid or expired token") {
      return "Your token is invalid or expired. Please login again.";
    }
    if (error.detail === "User not found") {
      return "The user linked to this token no longer exists.";
    }
    return `${error.detail} (HTTP ${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected profile error";
}

export default function MePage() {
  const router = useRouter();
  const [user, setUser] = useState<UserOut | null>(null);
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadCurrentUser = useCallback(async () => {
    const token = getAccessToken();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!token) {
      setUser(null);
      setErrorMessage("No access token found. Login or register first.");
      return;
    }

    setLoading(true);

    try {
      const result = await authMe(token);
      setUser(result);
      setSuccessMessage("Session valid. Redirecting to dashboard...");
      window.setTimeout(() => {
        router.replace("/dashboard");
      }, 300);
    } catch (error) {
      setUser(null);
      setErrorMessage(toMeErrorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [router]);

  function logout() {
    clearAccessToken();
    setUser(null);
    setErrorMessage(null);
    setSuccessMessage("Local token cleared. You are logged out on frontend.");
  }

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      void loadCurrentUser();
    }, 0);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [loadCurrentUser]);

  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        <section className={styles.story}>
          <p className={styles.storyKicker}>Protected Endpoint</p>
          <h1>Validate your session with `/auth/me`.</h1>
          <p>
            This screen tests your bearer token against the backend and confirms the current user profile. It is the
            final check for Step 2 authentication flow.
          </p>
          <ul className={styles.storyList}>
            <li>Reads token from browser localStorage</li>
            <li>Calls protected endpoint with Authorization header</li>
            <li>Supports manual refresh and local logout</li>
          </ul>
        </section>

        <main className={styles.card}>
          <header className={styles.header}>
            <h2>Current User</h2>
            <p>Profile fetched from backend `GET /auth/me`.</p>
          </header>

          <div className={styles.actions}>
            <button className={styles.primaryButton} onClick={() => void loadCurrentUser()} disabled={loading}>
              {loading ? "Loading..." : "Refresh profile"}
            </button>
            <button className={styles.secondaryButton} onClick={logout} type="button">
              Logout (clear token)
            </button>
          </div>

          {errorMessage && <p className={styles.error}>{errorMessage}</p>}
          {successMessage && <p className={styles.success}>{successMessage}</p>}

          {user && (
            <section className={styles.profileGrid}>
              <article className={styles.profileItem}>
                <span>User ID</span>
                <code>{user.id}</code>
              </article>
              <article className={styles.profileItem}>
                <span>Email</span>
                <code>{user.email}</code>
              </article>
              <article className={styles.profileItem}>
                <span>Full Name</span>
                <code>{user.full_name || "(not set)"}</code>
              </article>
              <article className={styles.profileItem}>
                <span>Role</span>
                <code>{user.role}</code>
              </article>
              <article className={styles.profileItem}>
                <span>Active</span>
                <code>{String(user.is_active)}</code>
              </article>
              <article className={styles.profileItem}>
                <span>Created At</span>
                <code>{user.created_at || "(unknown)"}</code>
              </article>
            </section>
          )}

          {!user && (
            <div className={styles.linksRow}>
              <Link className={styles.linkPill} href="/auth/login">
                Go to login
              </Link>
              <Link className={styles.linkPill} href="/auth/register">
                Go to register
              </Link>
              <Link className={styles.linkPill} href="/">
                Back to home
              </Link>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
