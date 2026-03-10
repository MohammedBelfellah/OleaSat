"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

import styles from "../auth.module.css";
import { ApiError, authRegister } from "@/lib/api";
import { saveAccessToken } from "@/lib/auth";

const REGISTER_ERROR_MESSAGES: Record<string, string> = {
  email_already_registered: "This email is already registered.",
};

function toRegisterErrorMessage(error: unknown): string {
  if (error instanceof ApiError) {
    return REGISTER_ERROR_MESSAGES[error.detail] || `${error.detail} (HTTP ${error.status})`;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return "Unexpected register error";
}

export default function RegisterPage() {
  const router = useRouter();

  const [fullName, setFullName] = useState("");
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
      const response = await authRegister({
        full_name: fullName.trim() || undefined,
        email,
        password,
      });
      saveAccessToken(response.access_token);
      setSuccessMessage("Account created. Redirecting to dashboard...");
      window.setTimeout(() => {
        router.push("/dashboard");
      }, 400);
    } catch (error) {
      setErrorMessage(toRegisterErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.page}>
      <div className={styles.grid}>
        <section className={styles.story}>
          <p className={styles.storyKicker}>OleaSat Onboarding</p>
          <h1>Create your account before adding farms and parcels.</h1>
          <p>
            This page connects to <code>/api/v1/auth/register</code>. After success, the JWT is stored locally so
            protected endpoints can be called immediately.
          </p>
          <ul className={styles.storyList}>
            <li>Register once and access all modules</li>
            <li>Role-aware token returned by backend</li>
            <li>Ready for step-by-step farm onboarding flow</li>
          </ul>
        </section>

        <main className={styles.card}>
          <header className={styles.header}>
            <h2>Inscription</h2>
            <p>Create a user account for OleaSat web app access.</p>
          </header>

          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.field}>
              <label htmlFor="full-name">Full Name (optional)</label>
              <input
                id="full-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Ahmed Al-Farsi"
              />
            </div>

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
                autoComplete="new-password"
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
                {pending ? "Creating account..." : "Create account"}
              </button>
            </div>
          </form>

          <div className={styles.linksRow}>
            <Link className={styles.linkPill} href="/auth/login">
              Already registered? Login
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
