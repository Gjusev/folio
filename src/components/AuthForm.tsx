"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { api } from "@/lib/client/api";
import { LangSwitcher, useI18n } from "@/lib/i18n/client";
import { Wordmark } from "./Wordmark";

export function AuthForm({ mode }: { mode: "login" | "register" }) {
  const router = useRouter();
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isRegister = mode === "register";

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("POST", `/api/auth/${mode}`, Object.fromEntries(form));
      router.replace("/projects");
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  return (
    <main className="flex min-h-full items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Wordmark href="/" />
          <p className="mt-1 text-sm text-muted">{t("auth.tagline")}</p>
        </div>
        <form onSubmit={onSubmit} className="sheet space-y-4 p-6" noValidate>
          <h1 className="text-[22px] leading-7 font-semibold">
            {isRegister ? t("auth.create") : t("auth.login")}
          </h1>
          {isRegister && (
            <div>
              <label htmlFor="name" className="label">
                {t("auth.name")}
              </label>
              <input
                id="name"
                name="name"
                className="input"
                autoComplete="name"
                required
                maxLength={100}
              />
            </div>
          )}
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
            />
          </div>
          <div>
            <label htmlFor="password" className="label">
              {t("auth.password")}
            </label>
            <input
              id="password"
              name="password"
              type="password"
              className="input"
              autoComplete={isRegister ? "new-password" : "current-password"}
              minLength={isRegister ? 10 : undefined}
              required
              aria-describedby={isRegister ? "password-hint" : undefined}
            />
            {isRegister && (
              <p id="password-hint" className="mt-1 text-xs text-muted">
                {t("auth.password.hint")}
              </p>
            )}
          </div>
          {error && (
            <p
              role="alert"
              className="rounded-md bg-[var(--pill-negative-bg)] px-3 py-2 text-sm text-[var(--pill-negative-ink)]"
            >
              {error}
            </p>
          )}
          <button type="submit" className="btn btn-primary w-full" disabled={busy}>
            {busy
              ? t("auth.submit.busy")
              : isRegister
                ? t("auth.submit.create")
                : t("auth.submit.login")}
          </button>
        </form>
        <div className="mt-6 flex items-center justify-center gap-4">
          <p className="text-center text-sm text-muted">
            {isRegister ? t("auth.toLogin") : t("auth.toRegister")}{" "}
            <Link
              className="font-medium text-accent underline-offset-4 hover:underline"
              href={isRegister ? "/login" : "/register"}
            >
              {isRegister ? t("auth.toLogin.action") : t("auth.toRegister.action")}
            </Link>
          </p>
        </div>
        <div className="mt-4 flex justify-center">
          <LangSwitcher />
        </div>
      </div>
    </main>
  );
}
