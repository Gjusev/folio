"use client";

import Image from "next/image";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/dictionaries";
import { LoopVideo } from "./LoopVideo";

// How it works as one horizontal accordion of tinted panels: the open stage
// takes most of the strip and shows name, paragraph and a real fragment of
// the product; the rest wait as slivers carrying their name rotated. Order is
// carried by colour (dark to light, in CSS via data-k). Clicking a sliver
// opens it; the whole panel is the button. Stages with a clip play it in
// place of the still; the still remains the poster and the no-JS view.
const STAGES = [
  {
    n: 1,
    src: "/landing/videos/pdf-source-poster.jpg",
    w: 1280,
    h: 720,
    clip: "/landing/videos/pdf-source.mp4",
  },
  { n: 2, src: "/landing/library.jpg", w: 1920, h: 1080, clip: null },
  {
    n: 3,
    src: "/landing/videos/literature-graph-poster.jpg",
    w: 1280,
    h: 720,
    clip: "/landing/videos/literature-graph.mp4",
  },
  { n: 4, src: null, w: 0, h: 0, clip: null },
] as const;

const COMMANDS = `cp .env.example .env
docker compose --profile app up -d --build`;

const rise = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function Stages() {
  const { t } = useI18n();
  const [i, setI] = useState(0);

  return (
    <section className="lp-acc" aria-labelledby="stages-title">
      <div className="lp-acc-intro">
        <h2 id="stages-title" className="lp-acc-h" data-reveal>
          {t("landing.stages.h")}
        </h2>
        <p className="lp-acc-p" data-reveal style={rise(1)}>
          {t("landing.stages.p")}
        </p>
      </div>
      <div className="lp-acc-strip" data-active={i} data-ui data-reveal style={rise(2)}>
        {STAGES.map((s, j) => {
          const isOpen = j === i;
          const name = t(`landing.stage.${s.n}.n` as MsgKey);
          return (
            <div key={s.n} className="lp-acc-panel" data-k={j} data-open={isOpen}>
              <button
                type="button"
                className="lp-acc-tab"
                aria-expanded={isOpen}
                onClick={() => setI(j)}
              >
                <span className="lp-acc-slv" aria-hidden>
                  {name}
                </span>
                <span className="lp-acc-name">{name}</span>
              </button>
              <div className="lp-acc-body" aria-hidden={!isOpen}>
                <p className="lp-acc-d">{t(`landing.stage.${s.n}.d` as MsgKey)}</p>
                <div className="lp-acc-media">
                  {s.clip && isOpen ? (
                    <LoopVideo
                      src={s.clip}
                      mime="video/mp4"
                      poster={s.src ?? undefined}
                      width={1280}
                      height={720}
                      label={t(`landing.stage.${s.n}.alt` as MsgKey)}
                    />
                  ) : s.src ? (
                    <Image
                      src={s.src}
                      alt={t(`landing.stage.${s.n}.alt` as MsgKey)}
                      width={s.w}
                      height={s.h}
                      sizes="(min-width: 900px) 40vw, 92vw"
                      loading="lazy"
                      unoptimized
                    />
                  ) : (
                    <pre>
                      <code>{COMMANDS}</code>
                    </pre>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
