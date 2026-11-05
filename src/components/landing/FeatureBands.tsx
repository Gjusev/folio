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
