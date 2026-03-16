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
            <h2>Create your OleaSat account</h2>
            <p>Register to start managing farms and irrigation analysis.</p>
          </header>

          <nav className={styles.authSwitch} aria-label="Auth switch">
            <Link className={styles.authSwitchLink} href="/auth/login">
              Sign In
            </Link>
            <span className={styles.authSwitchActive}>Register</span>
          </nav>

          <form className={styles.form} onSubmit={onSubmit}>
            <div className={styles.field}>
              <label htmlFor="full-name">Full Name (optional)</label>
              <input
                id="full-name"
                type="text"
                autoComplete="name"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                placeholder="Ahmed Al-Mansouri"
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
                placeholder="ahmed@example.com"
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
                placeholder="••••••••"
                minLength={6}
                required
              />
            </div>

            {errorMessage && <p className={styles.error}>{errorMessage}</p>}
            {successMessage && <p className={styles.success}>{successMessage}</p>}

            <div className={styles.actions}>
              <button className={styles.loginPrimaryButton} disabled={pending} type="submit">
                {pending ? "Creating account..." : "Create account"}
              </button>
            </div>
          </form>

          <p className={styles.loginFooterText}>
            Already have an account? <Link href="/auth/login">Sign in</Link>
          </p>
        </main>
      </div>
    </div>
  );
}
