"use client";

import Image from "next/image";
import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/dictionaries";

// One slider drives two fields: the clause (which is the section's heading)
// and a real fragment of the product. Dragging, arrow keys or tapping a stage
// name changes both.
const STAGES = [
  { n: 1, src: "/landing/editor-source.jpg", alt: "landing.stage.1.alt" },
  { n: 2, src: "/landing/library.jpg", alt: "landing.stage.2.alt" },
  { n: 3, src: "/landing/graph-explorer.jpg", alt: "landing.stage.3.alt" },
  { n: 4, src: null, alt: "landing.stage.4.alt" },
] as const;

const COMMANDS = `cp .env.example .env
docker compose --profile app up -d --build`;

export function Stages() {
  const { t } = useI18n();
  const [i, setI] = useState(0);
  const stage = STAGES[i];
  const pct = i / (STAGES.length - 1);

  return (
    <div className="lp-stages" data-reveal>
      <div className="lp-stage-text">
        <h2 id="stages-title" className="lp-stage-clause" aria-live="polite">
          {t(`landing.stage.${stage.n}.c` as MsgKey)}
        </h2>
        <p className="lp-stage-sub">{t(`landing.stage.${stage.n}.d` as MsgKey)}</p>
      </div>
      <div className="lp-stage-view">
        <div className="lp-stage-frame" key={stage.n} data-ui>
          {stage.src ? (
            <Image
              src={stage.src}
              alt={t(stage.alt as MsgKey)}
              width={1600}
              height={900}
              sizes="(min-width: 900px) 50vw, 100vw"
              unoptimized
            />
          ) : (
            <pre>
              <code>{COMMANDS}</code>
            </pre>
          )}
        </div>
      </div>
      <div className="lp-slider">
        <div className="lp-rangewrap">
          <div className="lp-bar" />
          <div className="lp-fill" style={{ width: `calc(16px + (100% - 32px) * ${pct})` }} />
          <input
            type="range"
            min={0}
            max={STAGES.length - 1}
            step={1}
            value={i}
            aria-label={t("landing.stage.aria")}
            aria-valuetext={t(`landing.stage.${stage.n}.n` as MsgKey)}
            onChange={(e) => setI(Number(e.target.value))}
          />
        </div>
        <ol>
          {STAGES.map((s, j) => (
            <li key={s.n} aria-current={j === i ? "step" : undefined}>
              <button type="button" onClick={() => setI(j)}>
                {t(`landing.stage.${s.n}.n` as MsgKey)}
              </button>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
