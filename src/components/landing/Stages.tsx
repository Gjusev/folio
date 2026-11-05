"use client";

import Image from "next/image";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/dictionaries";

// How it works as one horizontal accordion of tinted panels: the open stage
// takes most of the strip and shows name, paragraph and a real fragment of
// the product; the rest wait as slivers carrying their name rotated. Order is
// carried by colour (dark to light, in CSS via data-k). Clicking a sliver
// opens it; the whole panel is the button.
const STAGES = [
  { n: 1, src: "/landing/editor-source.jpg", w: 1600, h: 1636 },
  { n: 2, src: "/landing/library.jpg", w: 1920, h: 1080 },
  { n: 3, src: "/landing/graph-explorer.jpg", w: 1600, h: 900 },
  { n: 4, src: null, w: 0, h: 0 },
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
                  {s.src ? (
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
