// Public landing page (server component). The page is the promo film cut into
// chapters: same dark ground, silver serif headlines, teal accent and the
// film's own real-UI fragments (public/landing/promo, cut caption-free so all
// words here are translated HTML). The turn (graph -> cited draft) is the
// film's clip scrubbed by scroll. Design notes: docs/landing-design.md.
import Link from "next/link";
import { Logo } from "@/components/Logo";
import { LangSwitcher } from "@/lib/i18n/client";
import { format, type Dict, type MsgKey } from "@/lib/i18n/dictionaries";
import { FilmDialog } from "./FilmDialog";
import { LandingMotion } from "./LandingMotion";
import { LoopVideo } from "./LoopVideo";
import "./landing.css";

// The public repository (also what the README clones).
const REPO_URL = process.env.NEXT_PUBLIC_REPO_URL || "https://github.com/Gjusev/folio";
const P = "/landing/promo";

const rise = (i: number) => ({ "--i": i }) as React.CSSProperties;

// One fragment per capability, in film order.
const CAPS = [
  { n: 1, clip: "assistant", w: 900, h: 560 },
  { n: 2, clip: "search", w: 860, h: 1000 },
  { n: 3, clip: "graph", w: 1600, h: 900 },
  { n: 4, clip: "fix", w: 860, h: 930 },
  { n: 5, clip: "model", w: 1600, h: 900 },
] as const;

// Chapters around the turn, in the film's order. w/h are the fragment's pixels.
const BEFORE = [{ id: "lit", clip: "search", w: 860, h: 1000 }] as const;
const AFTER = [
  { id: "asst", clip: "assistant", w: 900, h: 560 },
  { id: "rev", clip: "review", w: 1040, h: 1020 },
  { id: "fix", clip: "fix", w: 860, h: 930 },
  { id: "ship", clip: "ship", w: 1000, h: 1040 },
] as const;

type Chapter = { id: string; clip: string; w: number; h: number };
type T = (k: MsgKey, vars?: Record<string, string | number>) => string;

/** Headline whose accent word (marked with *) takes the teal fill. */
function Head({
  text,
  as: Tag = "h2",
  id,
  reveal = true,
}: {
  text: string;
  as?: "h1" | "h2";
  id?: string;
  reveal?: boolean;
}) {
  const parts = text.split(/(\*[^*]+\*)/);
  return (
    <Tag id={id} className="lp-h" data-reveal={reveal ? "" : undefined}>
      {parts.map((p, i) =>
        p.startsWith("*") ? (
          <span key={i} className="lp-acc">
            {p.slice(1, -1)}
          </span>
        ) : (
          p
        ),
      )}
    </Tag>
  );
}

/** Text column on the left, a sticky stage on the right that swaps fragments
 *  as each chapter reaches the middle of the screen (desktop). On a phone each
 *  chapter carries its own fragment inline. */
function Chapters({ list, t, label }: { list: readonly Chapter[]; t: T; label: string }) {
  return (
    <section className="lp-ch" aria-label={label} data-chapters>
      <div className="lp-ch-text">
        {list.map((c, i) => (
          <article key={c.id} className="lp-ch-item" data-ch={i} aria-labelledby={`ch-${c.id}`}>
            <p className="lp-kick" data-reveal>
              {t(`landing.ch.${c.id}.k` as MsgKey)}
            </p>
            <Head id={`ch-${c.id}`} text={t(`landing.ch.${c.id}.h` as MsgKey)} />
            <p className="lp-p" data-reveal style={rise(1)}>
              {t(`landing.ch.${c.id}.p` as MsgKey)}
            </p>
            <figure className="lp-ch-inline" data-reveal style={rise(2)}>
              <LoopVideo
                src={`${P}/${c.clip}.mp4`}
                mime="video/mp4"
                poster={`${P}/${c.clip}.jpg`}
                width={c.w}
                height={c.h}
                label={t(`landing.ch.${c.id}.alt` as MsgKey)}
              />
            </figure>
          </article>
        ))}
      </div>
      <div className="lp-ch-stage" aria-hidden>
        <div className="lp-ch-sticky">
          {list.map((c, i) => (
            <video
              key={c.id}
              className="lp-ch-vid"
              data-stage={i}
              muted
              loop
              playsInline
              preload={i === 0 ? "metadata" : "none"}
              poster={`${P}/${c.clip}.jpg`}
              width={c.w}
              height={c.h}
              tabIndex={-1}
            >
              <source src={`${P}/${c.clip}.mp4`} type="video/mp4" />
            </video>
          ))}
        </div>
      </div>
    </section>
  );
}

export function Landing({
  dict,
  daysLeft,
  registrationOpen,
}: {
  dict: Dict;
  daysLeft: number;
  registrationOpen: boolean;
}) {
  const t: T = (k, vars) => format(dict, k, vars);
  const selfHost = `${REPO_URL}#quick-start-docker`;
  // Without open registration the honest action is "run your own".
  const action = registrationOpen ? "/register" : selfHost;
  const actionLabel = t(registrationOpen ? "landing.cta.main" : "landing.cta.selfhost");
  const film = {
    open: t("landing.film.btn"),
    len: "0:57",
    title: t("landing.film.title"),
    close: t("landing.film.close"),
  };

  return (
    <div className="lp">
      <LandingMotion />
      <a href="#main" className="lp-skip">
        {t("landing.skip")}
      </a>

      <header className="lp-top">
        <Link href="/" className="lp-wordmark lp-in" style={rise(0)} aria-label="Folio">
          <Logo className="h-7 w-auto" />
        </Link>
        <nav aria-label={t("landing.nav")} className="lp-nav lp-in" style={rise(1)}>
          <a href="#inside" className="lp-link lp-hide-s">
            {t("landing.cta.more")}
          </a>
          <a href="#self" className="lp-link lp-hide-s">
            {t("landing.nav.self")}
          </a>
          <LangSwitcher />
          <Link href="/login" className="lp-link">
            {t("auth.login")}
          </Link>
          <Link href={action} className="lp-btn lp-btn-s">
            {actionLabel}
          </Link>
        </nav>
      </header>

      <main id="main">
        {/* Hero: the film's opening. Pill, silver headline, one sentence, the
            action and the film; below, the window rising and compiling. */}
        <section className="lp-hero" aria-labelledby="hero-title">
          <p className="lp-pill lp-in" style={rise(0)}>
            {t("landing.hero.pill")}
          </p>
          <div className="lp-in" style={rise(1)}>
            <Head as="h1" id="hero-title" text={t("landing.hero.h")} reveal={false} />
          </div>
          <p className="lp-lead lp-in" style={rise(2)}>
            {t("landing.hero.sub")}
          </p>
          <div className="lp-actions lp-in" style={rise(3)}>
            <Link href={action} className="lp-btn">
              {actionLabel}
            </Link>
            <FilmDialog src={`${P}/film.mp4`} poster={`${P}/film.jpg`} {...film} />
          </div>
          {daysLeft > 0 && (
            <p className="lp-hero-prism lp-in" style={rise(4)}>
              <a href="#prism" className="lp-link">
                {t("landing.prism.h", { n: daysLeft })}
              </a>{" "}
              {t("landing.hero.prism")}
            </p>
          )}
          <figure className="lp-hero-film lp-in" style={rise(5)} data-parallax="-40">
            <LoopVideo
              src={`${P}/compile.mp4`}
              mime="video/mp4"
              poster={`${P}/compile.jpg`}
              width={1600}
              height={900}
              label={t("landing.hero.alt")}
              eager
            />
          </figure>
        </section>

        <Chapters list={BEFORE} t={t} label={t("landing.ch.lit.k")} />

        {/* The turn: the film's signature, scrubbed by scroll. */}
        <section className="lp-turn" aria-labelledby="turn-title" data-turn>
          <div className="lp-turn-sticky">
            <div className="lp-turn-lock">
              <p className="lp-kick">{t("landing.turn.k")}</p>
              <Head id="turn-title" text={t("landing.turn.h")} reveal={false} />
              <ol className="lp-turn-steps">
                {[1, 2, 3].map((n) => (
                  <li key={n} data-phase={n - 1}>
                    {t(`landing.turn.${n}` as MsgKey)}
                  </li>
                ))}
              </ol>
              <div className="lp-turn-bar" aria-hidden>
                <span />
              </div>
            </div>
            <video
              className="lp-turn-vid"
              muted
              playsInline
              preload="auto"
              poster={`${P}/turn.jpg`}
              width={1600}
              height={900}
              aria-label={t("landing.turn.alt")}
              tabIndex={-1}
            >
              <source src={`${P}/turn.mp4`} type="video/mp4" />
            </video>
          </div>
        </section>

        <Chapters list={AFTER} t={t} label={t("landing.ch.label")} />

        {/* Prism: the live number, different on every visit. */}
        <section id="prism" className="lp-sec lp-prism" aria-labelledby="prism-title">
          <div className="lp-prism-num" data-reveal aria-hidden>
            <span className="lp-days" data-countup>
              {Math.max(daysLeft, 0)}
            </span>
            <span className="lp-days-l">{t("landing.prism.until")}</span>
          </div>
          <div className="lp-prism-body">
            <h2 id="prism-title" className="lp-h" data-reveal>
              {daysLeft > 0 ? t("landing.prism.h", { n: daysLeft }) : t("landing.prism.closed")}
            </h2>
            <p className="lp-p" data-reveal style={rise(1)}>
              {t("landing.prism.body")}
            </p>
            <ol className="lp-steps">
              <li data-reveal style={rise(2)}>
                {t("landing.prism.step1")}
              </li>
              <li data-reveal style={rise(3)}>
                <Link href={action} className="lp-link">
                  {t("landing.prism.step2")}
                </Link>
              </li>
              <li data-reveal style={rise(4)}>
                {t("landing.prism.step3")}
              </li>
            </ol>
          </div>
        </section>

        {/* Your server, your model: the settings fragment, then the commands. */}
        <section id="self" className="lp-sec lp-self" aria-labelledby="self-title">
          <div className="lp-self-head">
            <Head id="self-title" text={t("landing.model.h")} />
            <p className="lp-p" data-reveal style={rise(1)}>
              {t("landing.model.p")}
            </p>
          </div>
          <figure className="lp-self-film" data-reveal style={rise(2)}>
            <LoopVideo
              src={`${P}/model.mp4`}
              mime="video/mp4"
              poster={`${P}/model.jpg`}
              width={1600}
              height={900}
              label={t("landing.model.alt")}
            />
          </figure>
          <div className="lp-self-run">
            <div>
              <h3 className="lp-h3" data-reveal>
                {t("landing.self.h")}
              </h3>
              <p className="lp-p" data-reveal style={rise(1)}>
                {t("landing.self.p")}
              </p>
              <a href={selfHost} className="lp-link" data-reveal style={rise(2)}>
                {t("landing.self.repo")}
              </a>
            </div>
            <pre className="lp-code" data-reveal style={rise(1)}>
              <code>
                <span className="lp-prompt">$</span> git clone {REPO_URL}.git folio
                {"\n"}
                <span className="lp-prompt">$</span> cd folio && cp .env.example .env
                {"\n"}
                <span className="lp-prompt">$</span> docker compose --profile app up -d
              </code>
            </pre>
          </div>
        </section>

        {/* What's inside: each capability beside its own playing fragment. */}
        <section id="inside" className="lp-sec lp-caps" aria-labelledby="caps-title">
          <h2 id="caps-title" className="lp-h" data-reveal>
            {t("landing.feat.title")}
          </h2>
          <ul className="lp-caps-list">
            {CAPS.map((c, j) => (
              <li
                key={c.n}
                className="lp-cap"
                data-cap={c.n}
                data-reveal
                style={rise(Math.min(j, 1))}
              >
                <div className="lp-cap-t">
                  <h3 className="lp-cap-n">{t(`landing.cap.${c.n}.s` as MsgKey)}</h3>
                  <p className="lp-cap-d">{t(`landing.cap.${c.n}.d` as MsgKey)}</p>
                </div>
                <figure className="lp-cap-m">
                  <LoopVideo
                    src={`${P}/${c.clip}.mp4`}
                    mime="video/mp4"
                    poster={`${P}/${c.clip}.jpg`}
                    width={c.w}
                    height={c.h}
                    label={t(`landing.cap.${c.n}.alt` as MsgKey)}
                  />
                </figure>
              </li>
            ))}
          </ul>
        </section>

        {/* The end card: the mark rises out of the glow, then the action. */}
        <section className="lp-end" aria-labelledby="end-title">
          <div className="lp-end-glow" aria-hidden data-glow />
          <Logo className="lp-end-mark" />
          <Head id="end-title" text={t("landing.close.h")} />
          <p className="lp-lead" data-reveal style={rise(1)}>
            {t("landing.close.p")}
          </p>
          <div className="lp-actions" data-reveal style={rise(2)}>
            <Link href={action} className="lp-btn">
              {actionLabel}
            </Link>
            <FilmDialog src={`${P}/film.mp4`} poster={`${P}/film.jpg`} {...film} />
          </div>
          <p className="lp-cmd" data-reveal style={rise(3)}>
            <span className="lp-prompt">$</span> docker compose --profile app up
          </p>
        </section>
      </main>

      <footer className="lp-foot">
        <Logo className="h-6 w-auto" />
        <p>{t("landing.foot.note")}</p>
        <p>{t("landing.foot.note2")}</p>
        <nav aria-label={t("landing.foot.col.code")} className="lp-foot-nav">
          <a href={REPO_URL} className="lp-link">
            {t("landing.foot.source")}
          </a>
          <Link href="/login" className="lp-link">
            {t("auth.login")}
          </Link>
          <Link href="/impressum" className="lp-link">
            {t("landing.foot.imprint")}
          </Link>
          <Link href="/datenschutz" className="lp-link">
            {t("landing.foot.privacy")}
          </Link>
          <a href="#main" className="lp-link">
            {t("landing.foot.top")}
          </a>
        </nav>
        <p className="lp-foot-legal">{t("landing.foot.legal")}</p>
      </footer>
    </div>
  );
}
