"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n/client";

// The demo project's library set like a station departure board: eight real
// papers, each row a filled band with name, year, venue and a status block.
// The open row (the default, in the accent) carries the detail. Clicking
// another row opens that one instead. Titles and venues are data, like the
// compose commands in the accordion: they do not translate.
const ROWS = [
  { title: "Attention Is All You Need", year: 2017, venue: "NeurIPS", st: "cited" },
  { title: "The Annotated Transformer", year: 2018, venue: "arXiv", st: "read" },
  { title: "BERT", year: 2019, venue: "NAACL", st: "cited" },
  { title: "Scaling Laws for Neural Language Models", year: 2020, venue: "arXiv", st: "queued" },
  { title: "Language Models are Few-Shot Learners", year: 2020, venue: "NeurIPS", st: "queued" },
  { title: "Retrieval-Augmented Generation", year: 2020, venue: "NeurIPS", st: "read" },
  { title: "FlashAttention", year: 2022, venue: "NeurIPS", st: "queued" },
  { title: "Training Compute-Optimal LLMs", year: 2022, venue: "arXiv", st: "read" },
] as const;

const rise = (i: number) => ({ "--i": i }) as React.CSSProperties;

export function ShowcaseBoard() {
  const { t } = useI18n();
  const [open, setOpen] = useState(0);

  return (
    <aside className="lp-board" data-ui aria-label={t("landing.board.aria")}>
      <ul className="lp-board-rows">
        {ROWS.map((r, j) => {
          const isOpen = j === open;
          return (
            <li
              key={r.title}
              className="lp-board-row"
              data-open={isOpen}
              data-reveal
              style={rise(j % 4)}
            >
              <button
                type="button"
                className="lp-board-btn"
                aria-expanded={isOpen}
                onClick={() => setOpen(j)}
              >
                <span className="lp-board-name">{r.title}</span>
                <span className="lp-board-fact">{r.year}</span>
                <span className="lp-board-fact">{r.venue}</span>
                <span className="lp-board-st" data-st={r.st}>
                  {t(`landing.board.st.${r.st}`)}
                </span>
              </button>
              <div className="lp-board-open" aria-hidden={!isOpen}>
                <p className="lp-board-detail">{t("landing.board.detail")}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
