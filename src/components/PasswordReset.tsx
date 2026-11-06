"use client";

import Link from "next/link";
import { useState, type ReactNode, type SubmitEvent } from "react";
import { api, ApiError } from "@/lib/client/api";
import { LangSwitcher, useI18n } from "@/lib/i18n/client";
import { Wordmark } from "./Wordmark";

const MIN_PASSWORD = 10;

/** Same frame as the login form: wordmark, one sheet, language switcher. */
function Shell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark href="/" />
        </div>
        <div className="sheet space-y-4 p-6">{children}</div>
        <p className="mt-6 text-center text-sm text-muted">
          <Link
            className="font-medium text-accent underline-offset-4 hover:underline"
            href="/login"
          >
            {t("auth.backToLogin")}
          </Link>
        </p>
        <div className="mt-4 flex justify-center">
          <LangSwitcher />
        </div>
      </div>
    </main>
  );
}

function Alert({ children }: { children: ReactNode }) {
  return (
    <p
      role="alert"
      className="rounded-md bg-[var(--pill-negative-bg)] px-3 py-2 text-sm text-[var(--pill-negative-ink)]"
    >
      {children}
    </p>
  );
}

export function ForgotForm({ mailOn }: { mailOn: boolean }) {
  const { t } = useI18n();
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/auth/forgot", { email: form.get("email") });
      setSent(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Shell>
      <h1 className="text-[22px] leading-7 font-semibold">{t("auth.forgot.t")}</h1>
      {!mailOn ? (
        <p data-testid="forgot-off" className="text-sm leading-6 text-muted">
          {t("auth.forgot.off")}
        </p>
      ) : sent ? (
        <p role="status" className="text-sm leading-6 text-ok">
          {t("auth.forgot.sent")}
        </p>
      ) : (
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          <p className="text-sm leading-6 text-muted">{t("auth.forgot.d")}</p>
          <div>
            <label htmlFor="email" className="label">
              {t("auth.email")}
            </label>
            <input
              id="email"
              name="email"
              type="email"
              className="input"
              autoComplete="email"
              required
              autoFocus
            />
          </div>
          {error && <Alert>{error}</Alert>}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy ? t("auth.submit.busy") : t("auth.forgot.submit")}
          </button>
        </form>
      )}
    </Shell>
  );
}

export function ResetForm({ token }: { token: string }) {
  const { t } = useI18n();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [state, setState] = useState<"form" | "done" | "invalid">(token ? "form" : "invalid");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const longEnough = password.length >= MIN_PASSWORD;

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    if (password !== confirm) return setError(t("auth.reset.mismatch"));
    if (!longEnough) return setError(t("auth.password.hint"));
    setBusy(true);
    setError(null);
    try {
      await api("POST", "/api/auth/reset", { token, password });
      setState("done");
    } catch (err) {
      // 400 = unknown, used or expired token: nothing to retry with this link.
      if (err instanceof ApiError && err.status === 400 && !("issues" in err.data)) {
        setState("invalid");
      } else {
        setError((err as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  if (state === "invalid") {
    return (
      <Shell>
        <h1 className="text-[22px] leading-7 font-semibold">{t("auth.reset.invalid.t")}</h1>
        <p className="text-sm leading-6 text-muted">{t("auth.reset.invalid.d")}</p>
        <Link href="/forgot" className="btn btn-primary w-full">
          {t("auth.reset.again")}
        </Link>
      </Shell>
    );
  }

  if (state === "done") {
    return (
      <Shell>
        <h1 className="text-[22px] leading-7 font-semibold">{t("auth.reset.t")}</h1>
        <p role="status" className="text-sm leading-6 text-ok">
          {t("auth.reset.done")}
        </p>
        <Link href="/login" className="btn btn-primary w-full">
          {t("auth.login")}
        </Link>
      </Shell>
    );
  }

  return (
    <Shell>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <h1 className="text-[22px] leading-7 font-semibold">{t("auth.reset.t")}</h1>
        <div>
          <label htmlFor="password" className="label">
            {t("auth.reset.password")}
          </label>
          <input
            id="password"
            name="password"
            type="password"
            className="input"
            autoComplete="new-password"
            minLength={MIN_PASSWORD}
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby="password-hint"
          />
          <p
            id="password-hint"
            className={`num mt-1 text-xs ${longEnough ? "text-ok" : "text-muted"}`}
          >
            {longEnough
              ? t("auth.password.ok")
              : `${t("auth.password.hint")} (${Math.min(password.length, MIN_PASSWORD)}/${MIN_PASSWORD})`}
          </p>
        </div>
        <div>
          <label htmlFor="confirm" className="label">
            {t("auth.reset.confirm")}
          </label>
          <input
            id="confirm"
            name="confirm"
            type="password"
            className="input"
            autoComplete="new-password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
          />
        </div>
        {error && <Alert>{error}</Alert>}
        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? t("auth.submit.busy") : t("auth.reset.submit")}
        </button>
      </form>
    </Shell>
  );
}
