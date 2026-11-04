"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";
import type { MsgKey } from "@/lib/i18n/dictionaries";

// Five capabilities, each one plain sentence with a working switch. On, a band
// fills with a colour and states the consequence. Two are on at load.
const BANDS = [
  { n: 1, tone: "a", on: true },
  { n: 2, tone: "b", on: false },
  { n: 3, tone: "c", on: true },
  { n: 4, tone: "b", on: false },
  { n: 5, tone: "c", on: false },
] as const;

export function FeatureBands() {
  const { t } = useI18n();
  const [on, setOn] = useState<boolean[]>(BANDS.map((b) => b.on));

  return (
    <ul className="lp-bands">
      {BANDS.map((b, i) => {
        const sId = `band-${b.n}-s`;
        return (
          <li
            key={b.n}
            className="lp-band"
            data-tone={b.tone}
            data-on={on[i]}
            data-reveal
            style={{ "--i": 0 } as React.CSSProperties}
          >
            <div>
              <h3 id={sId} className="lp-band-s">
                {t(`landing.band.${b.n}.s` as MsgKey)}
              </h3>
              <p className="lp-band-d" aria-hidden={!on[i]}>
                <span>{t(`landing.band.${b.n}.d` as MsgKey)}</span>
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={on[i]}
              aria-labelledby={sId}
              data-ui
              className="lp-switch"
              onClick={() => setOn((xs) => xs.map((v, j) => (j === i ? !v : v)))}
            />
          </li>
        );
      })}
    </ul>
  );
}
