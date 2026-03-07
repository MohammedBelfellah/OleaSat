"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import styles from "../auth.module.css";
import { ApiError, authLogin } from "@/lib/api";
import { saveAccessToken } from "@/lib/auth";

const LOGIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: "Email or password is incorrect.",
  account_deactivated: "This account is currently deactivated.",
};

function toLoginErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return LOGIN_ERROR_MESSAGES[error.detail] || `${error.detail} (HTTP ${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected login error";
}

export default function LoginPage() {
  const router = useRouter();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const response = await authLogin({ email, password });
      saveAccessToken(response.access_token);
      setSuccessMessage("Login successful. Redirecting to your profile...");
      window.setTimeout(() => {
        router.push("/auth/me");
      }, 400);
    } catch (error) {
      setErrorMessage(toLoginErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        <section className={styles.story}>
          <p className={styles.storyKicker}>OleaSat Access</p>
          <h1>Sign in to your precision irrigation workspace.</h1>
          <p>
            This login connects to your backend endpoint <code>/api/v1/auth/login</code> and stores the JWT token
            locally for protected API calls.
          </p>
          <ul className={styles.storyList}>
            <li>Secure session using JWT bearer token</li>
            <li>Fast handoff to profile validation on `/auth/me`</li>
            <li>Same account used for farm and dashboard features</li>
          </ul>
        </section>

        <main className={styles.card}>
          <header className={styles.header}>
            <h2>Connexion</h2>
            <p>Enter your email and password to continue.</p>
          </header>

          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.field}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </div>

            <div className={styles.field}>
              <label htmlFor="password">Password</label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
              />
            </div>

            {errorMessage && <p className={styles.error}>{errorMessage}</p>}
            {successMessage && <p className={styles.success}>{successMessage}</p>}

            <div className={styles.actions}>
              <button className={styles.primaryButton} disabled={pending} type="submit">
                {pending ? "Signing in..." : "Sign in"}
              </button>
            </div>
          </form>

          <div className={styles.linksRow}>
            <Link className={styles.linkPill} href="/auth/register">
              Need an account? Register
            </Link>
            <Link className={styles.linkPill} href="/auth/me">
              Open profile page
            </Link>
            <Link className={styles.linkPill} href="/">
              Back to home
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
