// Public landing page (server component). One sentence is the layout: a
// compiled page sits where the word "paper" would be. A folio is a sheet
// folded once (source on one leaf, result on the other); the page builds on
// that, and on the one time-boxed reason to switch: Prism closes on 2027-01-01.
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LangSwitcher } from "@/lib/i18n/client";
import { format, type Dict, type MsgKey } from "@/lib/i18n/dictionaries";
import { FeatureBands } from "./FeatureBands";
import { LandingMotion } from "./LandingMotion";
import { LoopVideo } from "./LoopVideo";
import { Stages } from "./Stages";
import "./landing.css";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "";

// Without open registration the honest action is "run your own".
const SELF_HOST_URL = REPO_URL ? `${REPO_URL}#quick-start-docker` : "/login";

const rise = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function Landing({
  dict,
  daysLeft,
  registrationOpen,
}: {
  dict: Dict;
  daysLeft: number;
  registrationOpen: boolean;
}) {
  const t = (k: MsgKey, vars?: Record<string, string | number>) => format(dict, k, vars);

  return (
    <div className="lp">
      <LandingMotion />

      <header className="lp-top">
        <Link href="/" className="lp-wordmark" aria-label="Folio">
          <Logo className="h-7 w-auto" />
        </Link>
        <nav aria-label={t("landing.nav")}>
          <LangSwitcher />
          <Link href="/login" className="link-lp">
            {t("auth.login")}
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero: the sentence, with a compiled page where one word would be */}
        <section className="lp-hero" aria-labelledby="hero-title">
          <h1 id="hero-title" className="lp-sentence">
            <span className="lp-line">
              <span>{t("landing.hero.a")}</span>
              <span className="lp-strip" aria-hidden>
                <Image
                  src="/landing/page-strip.jpg"
                  alt=""
                  width={1920}
                  height={220}
                  priority
                  unoptimized
                />
              </span>
              <span className="lp-strip lp-strip-m" aria-hidden>
                <Image
                  src="/landing/page-mobile.jpg"
                  alt=""
                  width={1000}
                  height={500}
                  loading="lazy"
                  unoptimized
                />
              </span>
              <span className="sr">{t("landing.hero.word")}</span>
            </span>
            <span className="lp-line lp-rise" style={rise(0)}>
              {t("landing.hero.b")}
            </span>
          </h1>
          <div className="lp-hero-foot">
            <p className="lp-lead lp-rise" style={rise(0)}>
              {t("landing.hero.sub")}
            </p>
            <div className="lp-actions lp-rise" style={rise(1)}>
              <Link href={registrationOpen ? "/register" : SELF_HOST_URL} className="btn-lp">
                {t(registrationOpen ? "landing.cta.main" : "landing.cta.selfhost")}
              </Link>
              <a href="#feat-title" className="link-lp">
                {t("landing.cta.more")}
              </a>
            </div>
          </div>
        </section>

        {/* The small slot opens to the whole screen: the product itself */}
        <div className="lp-window" data-reveal>
          <Image
            src="/landing/editor.jpg"
            alt={t("landing.stage.1.alt")}
            width={2400}
            height={1350}
            sizes="100vw"
            unoptimized
          />
        </div>

        {/* Prism: a live number, different on every visit */}
        <section className="lp-sec" aria-labelledby="prism-title">
          <div className="lp-split">
            <div>
              <h2 id="prism-title" className="lp-head" data-reveal>
                {daysLeft > 0 ? t("landing.prism.h", { n: daysLeft }) : t("landing.prism.closed")}
              </h2>
              <p className="lp-p" data-reveal style={rise(1)}>
                {t("landing.prism.body")}
              </p>
            </div>
            <div className="lp-clock">
              <span className="lp-days" data-reveal style={rise(1)} aria-hidden>
                {daysLeft}
              </span>
              <span className="lp-days-label lp-muted" data-reveal style={rise(2)} aria-hidden>
                {t("landing.prism.until")}
              </span>
              <ol className="lp-steps">
                <li data-reveal style={rise(2)}>
                  {t("landing.prism.step1")}
                </li>
                <li data-reveal style={rise(3)}>
                  <Link href={registrationOpen ? "/register" : SELF_HOST_URL} className="link-lp">
                    {t("landing.prism.step2")}
                  </Link>
                </li>
                <li data-reveal style={rise(4)}>
                  {t("landing.prism.step3")}
                </li>
              </ol>
            </div>
          </div>
        </section>

        {/* Features: sentences with switches */}
        <section aria-labelledby="feat-title">
          <h2 id="feat-title" className="sr">
            {t("landing.feat.title")}
          </h2>
          <FeatureBands />
        </section>

        {/* The name */}
        <section className="lp-sec" aria-labelledby="folio-title">
          <div className="lp-folio">
            <div>
              <h2 id="folio-title" className="lp-head" data-reveal>
                {t("landing.folio.h")}
              </h2>
              <p className="lp-p" data-reveal style={rise(1)}>
                {t("landing.folio.p")}
              </p>
            </div>
            <figure data-reveal style={rise(2)}>
              <Image
                src="/landing/first-folio.jpg"
                alt={t("landing.folio.alt")}
                width={900}
                height={1450}
                sizes="(min-width: 900px) 36vw, 90vw"
                loading="lazy"
                unoptimized
              />
              <figcaption>{t("landing.folio.cap")}</figcaption>
            </figure>
          </div>
          <figure className="lp-reel" data-reveal>
            <LoopVideo
              webm="/landing/letterpress.webm"
              poster="/landing/letterpress-poster.jpg"
              width={854}
              height={480}
            />
            <figcaption>{t("landing.folio.reel")}</figcaption>
          </figure>
        </section>

        {/* How it works: one slider drives the clause and the fragment */}
        <section aria-labelledby="stages-title">
          <Stages />
        </section>

        {/* Close: the idea again, inverted */}
        <section className="lp-close" aria-labelledby="close-title">
          <h2 id="close-title" data-reveal>
            {t("landing.close.h")}
          </h2>
          <div className="lp-close-foot" data-reveal style={rise(1)}>
            <p>{t("landing.close.p")}</p>
            <Link href={registrationOpen ? "/register" : SELF_HOST_URL} className="btn-lp on-dark">
              {t(registrationOpen ? "landing.close.cta" : "landing.cta.selfhost")}
            </Link>
          </div>
        </section>
      </main>

      <footer className="lp-foot">
        <div className="lp-foot-top" data-reveal>
          <p>{t("landing.foot.note")}</p>
          <p>{t("landing.foot.note2")}</p>
          <a href="#hero-title" className="link-lp">
            {t("landing.foot.top")}
          </a>
        </div>
        <div data-reveal style={rise(1)}>
          {REPO_URL ? (
            <a href={REPO_URL} className="lp-foot-big">
              Apache-2.0
            </a>
          ) : (
            <span className="lp-foot-big">Apache-2.0</span>
          )}
          <div className="lp-foot-meta" data-reveal>
            <span>{t("landing.foot.credit")}</span>
            <LangSwitcher />
            <span>© 2026 Folio</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
