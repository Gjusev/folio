// Public landing page (server component). Renders the migration-from-Prism
// story first: that close date is the one time-boxed reason to switch.
import Link from "next/link";
import {
  Container,
  History,
  Languages,
  MousePointerClick,
  Network,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { Wordmark } from "@/components/Wordmark";
import { LangSwitcher } from "@/lib/i18n/client";
import type { Dict, MsgKey } from "@/lib/i18n/dictionaries";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "";

const FEATURES: { icon: typeof Container; t: MsgKey; d: MsgKey }[] = [
  { icon: Container, t: "landing.feat.compile.t", d: "landing.feat.compile.d" },
  { icon: MousePointerClick, t: "landing.feat.synctex.t", d: "landing.feat.synctex.d" },
  { icon: Network, t: "landing.feat.graph.t", d: "landing.feat.graph.d" },
  { icon: History, t: "landing.feat.snap.t", d: "landing.feat.snap.d" },
  { icon: Sparkles, t: "landing.feat.ai.t", d: "landing.feat.ai.d" },
  { icon: Languages, t: "landing.feat.open.t", d: "landing.feat.open.d" },
];

export function Landing({ dict }: { dict: Dict }) {
  const t = (k: MsgKey) => dict[k];

  return (
    <div className="min-h-full bg-ground">
      <header className="mx-auto flex max-w-5xl items-center justify-between px-4 py-5 sm:px-6">
        <Wordmark href="/" />
        <div className="flex items-center gap-2">
          <LangSwitcher />
          <Link href="/login" className="btn">
            {t("auth.login")}
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 pb-16 sm:px-6">
        {/* Hero */}
        <section className="pt-10 pb-12 sm:pt-16" aria-labelledby="hero-title">
          <h1
            id="hero-title"
            className="max-w-2xl font-serif text-4xl leading-tight tracking-tight text-balance sm:text-5xl"
          >
            {t("landing.hero.title")}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-6 text-muted">{t("landing.hero.body")}</p>
          <div className="mt-6 flex flex-wrap gap-2">
            <Link href="/register" className="btn btn-primary h-9 px-4 text-sm">
              <UserPlus aria-hidden className="h-4 w-4" />
              {t("auth.create")}
            </Link>
            <Link href="/login" className="btn h-9 px-4 text-sm">
              {t("landing.hero.cta.demo")}
            </Link>
          </div>
        </section>

        {/* Prism migration */}
        <section
          aria-labelledby="prism-title"
          className="sheet border-accent/60 bg-accent-soft/50 p-6 sm:p-8"
        >
          <h2 id="prism-title" className="text-xl font-semibold">
            {t("landing.prism.title")}
          </h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">{t("landing.prism.body")}</p>
          <ol className="mt-5 grid gap-4 sm:grid-cols-3">
            <li className="rounded-lg border border-line bg-surface p-4">
              <p className="num text-xs font-medium text-accent">1</p>
              <p className="mt-1 text-sm leading-6">{t("landing.prism.step1")}</p>
            </li>
            <li className="rounded-lg border border-line bg-surface p-4">
              <p className="num text-xs font-medium text-accent">2</p>
              <p className="mt-1 text-sm leading-6">
                <Link href="/register" className="font-medium underline underline-offset-2">
                  {t("landing.prism.step2")}
                </Link>
              </p>
            </li>
            <li className="rounded-lg border border-line bg-surface p-4">
              <p className="num text-xs font-medium text-accent">3</p>
              <p className="mt-1 text-sm leading-6">{t("landing.prism.step3")}</p>
            </li>
          </ol>
          <Link href="/register" className="btn btn-primary mt-6">
            {t("landing.prism.cta")}
          </Link>
        </section>

        {/* Features */}
        <section className="pt-12" aria-labelledby="feat-title">
          <h2 id="feat-title" className="text-xl font-semibold">
            {t("landing.feat.title")}
          </h2>
          <ul className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map(({ icon: Icon, t: tk, d: dk }) => (
              <li key={tk} className="sheet p-4">
                <Icon aria-hidden className="h-5 w-5 text-accent" />
                <h3 className="mt-2.5 text-sm font-semibold">{t(tk)}</h3>
                <p className="mt-1 text-sm leading-5 text-muted">{t(dk)}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Quickstart */}
        <section className="pt-12" aria-labelledby="stack-title">
          <h2 id="stack-title" className="text-xl font-semibold">
            {t("landing.stack.title")}
          </h2>
          <p className="mt-1 text-sm text-muted">{t("landing.stack.sub")}</p>
          <ol className="mt-5 grid gap-3 sm:grid-cols-3">
            <li className="sheet p-4">
              <p className="num text-xs font-medium text-accent">1</p>
              <h3 className="mt-1 text-sm font-semibold">{t("landing.stack.1.t")}</h3>
              <p className="mt-1 text-sm leading-5 text-muted">{t("landing.stack.1.d")}</p>
              <pre className="mt-3 rounded-md bg-raised p-2.5 font-mono text-xs leading-5 break-words whitespace-pre-wrap text-ink">
                <code>cp .env.example .env{"\n"}docker compose --profile app up -d --build</code>
              </pre>
            </li>
            <li className="sheet p-4">
              <p className="num text-xs font-medium text-accent">2</p>
              <h3 className="mt-1 text-sm font-semibold">{t("landing.stack.2.t")}</h3>
              <p className="mt-1 text-sm leading-5 text-muted">{t("landing.stack.2.d")}</p>
              <Link href="/register" className="btn mt-3">
                {t("auth.create")}
              </Link>
            </li>
            <li className="sheet p-4">
              <p className="num text-xs font-medium text-accent">3</p>
              <h3 className="mt-1 text-sm font-semibold">{t("landing.stack.3.t")}</h3>
              <p className="mt-1 text-sm leading-5 text-muted">{t("landing.stack.3.d")}</p>
            </li>
          </ol>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-4 gap-y-1 px-4 py-5 text-xs text-muted sm:px-6">
          <p>{t("landing.footer.tag")}</p>
          {REPO_URL && (
            <a href={REPO_URL} className="underline underline-offset-2 hover:text-ink">
              {t("landing.footer.code")}
            </a>
          )}
        </div>
      </footer>
    </div>
  );
}
