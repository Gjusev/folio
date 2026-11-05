// Public landing page (server component), dealt as a streetwear drop: the
// shout says Folio never closes (Prism does), the compiled page is the poster
// scrap straddling the seam onto the paper band, and the Prism countdown is
// the release timer. Sections follow the dealt blueprints: poster list of
// capabilities, the demo library as a departure board, a tinted accordion of
// stages, one word as the button, and a footer of columns over the wordmark.
import Image from "next/image";
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LangSwitcher } from "@/lib/i18n/client";
import { format, type Dict, type MsgKey } from "@/lib/i18n/dictionaries";
import { AiFilm } from "./AiFilm";
import { LandingMotion } from "./LandingMotion";
import { LoopVideo } from "./LoopVideo";
import { Stages } from "./Stages";
import "./landing.css";

const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL ?? "";

// Without open registration the honest action is "run your own".
const SELF_HOST_URL = REPO_URL ? `${REPO_URL}#quick-start-docker` : "/login";

const rise = (i: number) => ({ "--i": i }) as React.CSSProperties;

const CAPS = [1, 2, 3, 4, 5] as const;

// The four-scene film strip before the close: real clips, honest captions.
const STRIP = [
  { v: "reviewer", k: "landing.sheet.1" },
  { v: "error-fix", k: "landing.sheet.2" },
  { v: "versions-latexdiff", k: "landing.sheet.3" },
  { v: "own-agent-mcp", k: "landing.sheet.4" },
] as const;

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
  const action = registrationOpen ? "/register" : SELF_HOST_URL;
  const actionLabel = t(registrationOpen ? "landing.cta.main" : "landing.cta.selfhost");

  return (
    <div className="lp">
      <LandingMotion />

      <header className="lp-top">
        <Link href="/" className="lp-wordmark" aria-label="Folio">
          <Logo className="h-7 w-auto" />
        </Link>
        <nav aria-label={t("landing.nav")}>
          <a href="#caps-title" className="link-lp lp-top-more">
            {t("landing.cta.more")}
          </a>
          <LangSwitcher />
          <Link href="/login" className="link-lp">
            {t("auth.login")}
          </Link>
        </nav>
      </header>

      <main>
        {/* Hero: flush-left shout on night, the compiled page as a poster
            scrap rotated over the seam onto the paper band. One sentence and
            one action live on the band. */}
        <section className="lp-hero" aria-labelledby="hero-title">
          <div className="lp-hero-field">
            <div className="lp-hero-left">
              <h1 id="hero-title" className="lp-shout">
                <span className="lp-shout-l lp-rise" style={rise(0)}>
                  {t("landing.hero.l1")}
                </span>
                <span className="lp-shout-l lp-rise" style={rise(1)}>
                  {t("landing.hero.l2")}
                </span>
              </h1>
              <p className="lp-hero-say lp-rise" style={rise(2)}>
                {t("landing.hero.cat")}
              </p>
            </div>
            <figure className="lp-scrap">
              <div className="lp-scrap-arch">
                <div>
                  <Image
                    src="/landing/page-portrait.jpg"
                    alt={t("landing.hero.scrap-alt")}
                    width={2073}
                    height={2769}
                    priority
                    unoptimized
                  />
                </div>
              </div>
              <div className="lp-scrap-m" aria-hidden>
                <Image
                  src="/landing/page-portrait.jpg"
                  alt=""
                  width={2073}
                  height={2769}
                  priority
                  unoptimized
                />
              </div>
            </figure>
          </div>
          <div className="lp-hero-band">
            <Link href={action} className="btn-lp lp-hero-cta lp-rise" style={rise(3)}>
              {actionLabel}
            </Link>
            {daysLeft > 0 && (
              <p className="lp-band-timer lp-rise" style={rise(4)} aria-hidden>
                <span className="lp-band-days num">{daysLeft}</span>
                <span className="lp-band-until">{t("landing.prism.until")}</span>
              </p>
            )}
          </div>
        </section>

        {/* The product emerges on the first scroll */}
        <section className="lp-window" aria-labelledby="window-title">
          <h2 id="window-title" className="sr">
            {t("landing.window.h")}
          </h2>
          <div className="lp-window-frame" data-reveal>
            <LoopVideo
              src="/landing/videos/ai-diffs.mp4"
              mime="video/mp4"
              poster="/landing/videos/ai-diffs-poster.jpg"
              width={1920}
              height={1080}
              label={t("landing.window.alt")}
            />
          </div>
          <p className="lp-window-cap" data-reveal style={rise(1)}>
            {t("landing.hero.sub")}
          </p>
        </section>

        {/* Prism: a live number, different on every visit — the drop timer */}
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
                  <Link href={action} className="link-lp">
                    {t("landing.prism.step2")}
                  </Link>
                </li>
                <li data-reveal style={rise(4)}>
                  {t("landing.prism.step3")}
                </li>
              </ol>
              <figure className="lp-prism-film" data-reveal style={rise(5)}>
                <LoopVideo
                  src="/landing/videos/prism-import.mp4"
                  mime="video/mp4"
                  poster="/landing/videos/prism-import-poster.jpg"
                  width={1280}
                  height={720}
                  label={t("landing.prism.film")}
                />
                <figcaption>{t("landing.prism.film")}</figcaption>
              </figure>
            </div>
          </div>
        </section>

        {/* Capabilities at poster scale: the heading is the first row of the
            list, each name with its one-sentence description beside it */}
        <section className="lp-caps" aria-labelledby="caps-title">
          <ul className="lp-caps-list">
            <li className="lp-cap lp-cap-soft" data-reveal>
              <h2 id="caps-title" className="lp-cap-n">
                {t("landing.feat.title")}
              </h2>
            </li>
            {CAPS.map((n, j) => (
              <li key={n} className="lp-cap" data-reveal style={rise(j)}>
                <h3 className="lp-cap-n">{t(`landing.cap.${n}.s` as MsgKey)}</h3>
                <p className="lp-cap-d">{t(`landing.cap.${n}.d` as MsgKey)}</p>
              </li>
            ))}
          </ul>
        </section>

        {/* Writing with AI — the headline appeal, with its exact rules */}
        <section className="lp-sec" aria-labelledby="ai-title">
          <div className="lp-split">
            <div>
              <h2 id="ai-title" className="lp-head" data-reveal>
                {t("landing.ai.h")}
              </h2>
              <p className="lp-p" data-reveal style={rise(1)}>
                {t("landing.ai.p")}
              </p>
            </div>
            <div className="lp-ai-slot" data-reveal style={rise(2)}>
              <div className="lp-ai-frag" data-ui>
                <p className="lp-ai-you">
                  <span className="lp-ai-tag">{t("landing.ai.you")}</span>
                  {t("landing.ai.instr")}
                </p>
                <ul className="lp-ai-ev">
                  <li>Attention Is All You Need · 2017</li>
                  <li>BERT · 2019</li>
                  <li>Deep Residual Learning · 2016</li>
                </ul>
                <p className="lp-ai-draft">
                  <span className="lp-ai-tag">{t("landing.ai.agent")}</span>
                  {t("landing.ai.draft")}
                  <span className="lp-ai-caret" aria-hidden />
                </p>
              </div>
              <AiFilm src="/landing/videos/launch.mp4" label={t("landing.ai.film")} />
            </div>
          </div>
        </section>

        {/* How it works: tinted accordion of the four stages */}
        <Stages />

        {/* Four more scenes, in motion: the strip of real clips before the close */}
        <section className="lp-strip" aria-labelledby="strip-title">
          <h2 id="strip-title" className="sr">
            {t("landing.sheet.h")}
          </h2>
          {STRIP.map((s, j) => (
            <figure key={s.v} data-reveal style={rise(j)}>
              <LoopVideo
                src={`/landing/videos/${s.v}.mp4`}
                mime="video/mp4"
                poster={`/landing/videos/${s.v}-poster.jpg`}
                width={1280}
                height={720}
                label={t(s.k as MsgKey)}
              />
              <figcaption>{t(s.k as MsgKey)}</figcaption>
            </figure>
          ))}
        </section>

        {/* Close: the whole band is the button, one word on the accent */}
        <section className="lp-cta" aria-labelledby="cta-title">
          <Link href={action} className="lp-cta-band">
            <p className="lp-cta-note">{t("landing.close.p")}</p>
            <svg className="lp-cta-arrow" viewBox="0 0 48 48" aria-hidden focusable="false">
              <path
                d="M12 36 36 12M20 12h16v16"
                fill="none"
                stroke="currentColor"
                strokeWidth="4"
              />
            </svg>
            <h2 id="cta-title" className="lp-cta-word">
              {t("landing.cta.word")}
            </h2>
          </Link>
        </section>
      </main>

      {/* Footer: columns of small print above a wordmark fitted to the width */}
      <footer className="lp-foot">
        <div className="lp-foot-cols">
          <div className="lp-foot-col" data-reveal>
            <h2 className="lp-foot-colh">{t("landing.foot.col.self")}</h2>
            <p>{t("landing.foot.note")}</p>
            <p>{t("landing.foot.note2")}</p>
          </div>
          <nav className="lp-foot-col" aria-label={t("landing.nav")} data-reveal style={rise(1)}>
            <h2 className="lp-foot-colh">{t("landing.nav")}</h2>
            <ul>
              <li>
                <Link href="/login" className="link-lp">
                  {t("auth.login")}
                </Link>
              </li>
              <li>
                <Link href={action} className="link-lp">
                  {actionLabel}
                </Link>
              </li>
              <li>
                <a href="#hero-title" className="link-lp">
                  {t("landing.foot.top")}
                </a>
              </li>
            </ul>
          </nav>
          <div className="lp-foot-col" data-reveal style={rise(2)}>
            <h2 className="lp-foot-colh">{t("landing.foot.col.code")}</h2>
            <ul>
              {REPO_URL ? (
                <li>
                  <a href={REPO_URL} className="link-lp">
                    {t("landing.foot.source")}
                  </a>
                </li>
              ) : null}
              <li>Apache-2.0</li>
            </ul>
          </div>
        </div>
        <div className="lp-foot-end" data-reveal>
          <Logo className="lp-foot-mark" />
          <p className="lp-foot-legal">
            <span>{t("landing.foot.legal")}</span>
            <LangSwitcher />
          </p>
        </div>
      </footer>
    </div>
  );
}
