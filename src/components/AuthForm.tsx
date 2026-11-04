"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type SubmitEvent } from "react";
import { Eye, EyeOff, FileCheck2, Quote, ServerCog } from "lucide-react";
import { api } from "@/lib/client/api";
import { LangSwitcher, useI18n } from "@/lib/i18n/client";
import { Wordmark } from "./Wordmark";

const MIN_PASSWORD = 10;

// Same rule as the landing CTA: point at the repo's install section when the
// URL is known, otherwise stay on this app.
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "";
const SELF_HOST_URL = REPO_URL ? `${REPO_URL}#quick-start-docker` : "/login";

const BENEFITS = [
  { icon: FileCheck2, t: "auth.register.b1.t", d: "auth.register.b1.d" },
  { icon: Quote, t: "auth.register.b2.t", d: "auth.register.b2.d" },
  { icon: ServerCog, t: "auth.register.b3.t", d: "auth.register.b3.d" },
] as const;

export function AuthForm({
  mode,
  registrationOpen = true,
}: {
  mode: "login" | "register";
  registrationOpen?: boolean;
}) {
  const router = useRouter();
  const { t, lang } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [wantsDemo, setWantsDemo] = useState(true);
  const isRegister = mode === "register";
  const longEnough = password.length >= MIN_PASSWORD;

  async function onSubmit(e: SubmitEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setBusy(true);
    setError(null);
    try {
      await api("POST", `/api/auth/${mode}`, {
        email: form.get("email"),
        password: form.get("password"),
        ...(isRegister ? { name: form.get("name") } : {}),
      });
      let target = isRegister ? "/projects?welcome=1" : "/projects";
      if (isRegister && wantsDemo) {
        // The account exists at this point; a failed demo must not block the sign-up.
        try {
          const { project } = await api<{ project: { id: string } }>("POST", "/api/projects/demo", {
            lang,
          });
          target = `/projects/${project.id}`;
        } catch {
          /* fall back to the welcome screen */
        }
      }
      router.replace(target);
      router.refresh();
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  }

  // A dead form lies: with registration closed the page says so and points
  // elsewhere instead of rendering inputs that can only fail.
  if (isRegister && !registrationOpen) {
    return (
      <main className="flex min-h-full items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm text-center">
          <Wordmark href="/" />
          <div className="sheet mt-6 space-y-4 p-6">
            <h1 className="text-[22px] leading-7 font-semibold">{t("auth.closed.t")}</h1>
            <p className="text-sm leading-6 text-muted">{t("auth.closed.d")}</p>
            <Link href={SELF_HOST_URL} className="btn btn-primary w-full">
              {t("landing.cta.selfhost")}
            </Link>
            <p className="text-sm text-muted">
              {t("auth.toLogin")}{" "}
              <Link
                className="font-medium text-accent underline-offset-4 hover:underline"
                href="/login"
              >
                {t("auth.toLogin.action")}
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

  const form = (
    <div className="w-full max-w-sm">
      {!isRegister && (
        <div className="mb-8 text-center">
          <Wordmark href="/" />
          <p className="mt-1 text-sm text-muted">{t("auth.tagline")}</p>
        </div>
      )}
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
              autoFocus
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
            autoFocus={!isRegister}
          />
        </div>
        <div>
          <div className="flex items-baseline justify-between">
            <label htmlFor="password" className="label">
              {t("auth.password")}
            </label>
            <button
              type="button"
              className="mb-1 inline-flex items-center gap-1 text-xs text-muted hover:text-ink"
              onClick={() => setShowPassword((v) => !v)}
              aria-pressed={showPassword}
            >
              {showPassword ? (
                <EyeOff aria-hidden className="h-3.5 w-3.5" />
              ) : (
                <Eye aria-hidden className="h-3.5 w-3.5" />
              )}
              {showPassword ? t("auth.password.hide") : t("auth.password.show")}
            </button>
          </div>
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            className="input"
            autoComplete={isRegister ? "new-password" : "current-password"}
            minLength={isRegister ? MIN_PASSWORD : undefined}
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-describedby={isRegister ? "password-hint" : undefined}
          />
          {isRegister && (
            <p
              id="password-hint"
              className={`num mt-1 text-xs ${longEnough ? "text-ok" : "text-muted"}`}
            >
              {longEnough
                ? t("auth.password.ok")
                : `${t("auth.password.hint")} (${Math.min(password.length, MIN_PASSWORD)}/${MIN_PASSWORD})`}
            </p>
          )}
        </div>
        {isRegister && (
          <label className="flex cursor-pointer gap-2.5 rounded-lg bg-accent-soft p-3 text-sm">
            <input
              type="checkbox"
              className="mt-0.5 accent-[var(--accent)]"
              checked={wantsDemo}
              onChange={(e) => setWantsDemo(e.target.checked)}
            />
            <span>
              <span className="block font-medium">{t("auth.demo.opt")}</span>
              <span className="block text-xs leading-5 text-muted">{t("auth.demo.opt.d")}</span>
            </span>
          </label>
        )}
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
        {isRegister && <p className="text-center text-xs text-muted">{t("auth.privacy")}</p>}
      </form>
      {(isRegister || registrationOpen) && (
        <p className="mt-6 text-center text-sm text-muted">
          {isRegister ? t("auth.toLogin") : t("auth.toRegister")}{" "}
          <Link
            className="font-medium text-accent underline-offset-4 hover:underline"
            href={isRegister ? "/login" : "/register"}
          >
            {isRegister ? t("auth.toLogin.action") : t("auth.toRegister.action")}
          </Link>
        </p>
      )}
      <div className="mt-4 flex justify-center">
        <LangSwitcher />
      </div>
    </div>
  );

  if (!isRegister) {
    return <main className="flex min-h-full items-center justify-center px-4 py-12">{form}</main>;
  }

  return (
    <main className="mx-auto grid min-h-full max-w-5xl items-center gap-10 px-4 py-10 lg:grid-cols-[1fr_24rem] lg:gap-16">
      <section aria-labelledby="register-lead" className="max-lg:order-2">
        <Wordmark href="/" />
        <h2
          id="register-lead"
          className="mt-6 max-w-md font-serif text-3xl leading-tight tracking-tight text-balance sm:text-4xl"
        >
          {t("auth.register.lead")}
        </h2>
        <ul className="mt-8 space-y-5">
          {BENEFITS.map(({ icon: Icon, t: tk, d: dk }) => (
            <li key={tk} className="flex gap-3">
              <Icon aria-hidden className="mt-0.5 h-5 w-5 shrink-0 text-accent" />
              <div>
                <p className="text-sm font-semibold">{t(tk)}</p>
                <p className="mt-0.5 max-w-sm text-sm leading-6 text-muted">{t(dk)}</p>
              </div>
            </li>
          ))}
        </ul>
      </section>
      <div className="flex justify-center max-lg:order-1 lg:justify-end">{form}</div>
    </main>
  );
}
