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
      setSuccessMessage("Login successful. Redirecting to dashboard...");
      window.setTimeout(() => {
        router.push("/dashboard");
      }, 400);
    } catch (error) {
      setErrorMessage(toLoginErrorMessage(error));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={styles.loginPage}>
      <div className={styles.loginShell}>
        <section className={styles.loginVisual}>
          <div className={styles.loginOverlay}>
            <p className={styles.loginBrand}>OleaSat</p>
            <h1>Precision monitoring for resilient orchards</h1>
            <p>Use satellite intelligence to strengthen sustainable agriculture in North Africa.</p>
          </div>
        </section>

        <main className={styles.loginPanel}>
          <header className={styles.loginHeader}>
            <h2>Welcome to OleaSat</h2>
            <p>Sign in to access your workspace.</p>
          </header>

          <nav className={styles.authSwitch} aria-label="Auth switch">
            <span className={styles.authSwitchActive}>Sign In</span>
            <Link className={styles.authSwitchLink} href="/auth/register">
              Register
            </Link>
          </nav>

          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.field}>
              <label htmlFor="email">Email</label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="ahmed@example.com"
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
                placeholder="••••••••"
                minLength={6}
                required
              />
            </div>

            {errorMessage && <p className={styles.error}>{errorMessage}</p>}
            {successMessage && <p className={styles.success}>{successMessage}</p>}

            <div className={styles.actions}>
              <button className={styles.loginPrimaryButton} disabled={pending} type="submit">
                {pending ? "Signing in..." : "Sign In"}
              </button>
            </div>
          </form>

          <p className={styles.loginFooterText}>
            Don&apos;t have an account? <Link href="/auth/register">Create one</Link>
          </p>
        </main>
      </div>
    </div>
  );
}
