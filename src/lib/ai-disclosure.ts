// Pure: the generative-AI declaration journals ask authors for, built from the
// project's AI-use ledger (ai_usage) instead of the authors' memory.
import type { Lang } from "@/lib/i18n/dictionaries";

export type AiEvent = { action: string; model: string; createdAt: Date };

export type Disclosure = {
  latex: string;
  /** Purpose phrases in `lang`, in declaration order. */
  purposes: string[];
  /** Distinct model ids, sorted (raw, not LaTeX-escaped). */
  models: string[];
  /** yyyy-mm-dd (UTC) of the first and last recorded event. */
  from: string;
  to: string;
  count: number;
};

/** Declared purposes, in the order the sentence lists them. */
const PURPOSES = [
  "questions",
  "language",
  "drafting",
  "outline",
  "latex",
  "feedback",
  "images",
  "retrieval",
] as const;
type Purpose = (typeof PURPOSES)[number];

/** Ledger action → purpose. `improve` stays declared: Elsevier exempts only
 *  basic grammar/spelling checks, not rewording or reorganising sentences. */
const PURPOSE_OF: Record<string, Purpose> = {
  ask: "questions",
  explain: "questions",
  improve: "language",
  continue: "drafting",
  draft: "drafting",
  plan: "outline",
  fix: "latex",
  review: "feedback",
  image: "images",
  embed: "retrieval",
};

type Text = {
  title: string;
  body: (models: string, purposes: string) => string;
  purposes: Record<Purpose, string>;
};

// English is Elsevier's wording verbatim (generative-AI policy for journals);
// es/de are faithful translations of the same structure.
const TEXT: Record<Lang, Text> = {
  en: {
    title:
      "Declaration of generative AI and AI-assisted technologies in the manuscript preparation process",
    body: (m, p) =>
      `During the preparation of this work, the author(s) used ${m} through Folio in order to ${p}. After using this tool/service, the author(s) reviewed and edited the content as needed and take(s) full responsibility for the content of the published article.`,
    purposes: {
      questions: "answer questions about the manuscript",
      language: "improve language and readability",
      drafting: "draft text",
      outline: "outline sections",
      latex: "resolve LaTeX compilation errors",
      feedback: "obtain pre-submission feedback on the manuscript",
      images: "convert images of equations, tables or diagrams to LaTeX",
      retrieval: "index the manuscript for retrieval",
    },
  },
  es: {
    title:
      "Declaración sobre IA generativa y tecnologías asistidas por IA en el proceso de preparación del manuscrito",
    body: (m, p) =>
      `Durante la preparación de este trabajo, el/los autor(es) ha(n) utilizado ${m} a través de Folio con el fin de ${p}. Tras utilizar esta herramienta/servicio, el/los autor(es) ha(n) revisado y editado el contenido según ha sido necesario y asume(n) plena responsabilidad por el contenido del artículo publicado.`,
    purposes: {
      questions: "responder preguntas sobre el manuscrito",
      language: "mejorar la redacción y la legibilidad",
      drafting: "redactar texto",
      outline: "esbozar la estructura de las secciones",
      latex: "resolver errores de compilación de LaTeX",
      feedback: "obtener comentarios sobre el manuscrito antes de su envío",
      images: "convertir imágenes de ecuaciones, tablas o diagramas a LaTeX",
      retrieval: "indexar el manuscrito para la recuperación de información",
    },
  },
  de: {
    title:
      "Erklärung zu generativer KI und KI-gestützten Technologien im Prozess der Manuskripterstellung",
    body: (m, p) =>
      `Während der Erstellung dieser Arbeit hat/haben der/die Autor(en) ${m} über Folio verwendet, um ${p}. Nach der Verwendung dieses Tools/Dienstes hat/haben der/die Autor(en) den Inhalt nach Bedarf überprüft und bearbeitet und übernimmt/übernehmen die volle Verantwortung für den Inhalt des veröffentlichten Artikels.`,
    purposes: {
      questions: "Fragen zum Manuskript zu beantworten",
      language: "Sprache und Lesbarkeit zu verbessern",
      drafting: "Text zu entwerfen",
      outline: "Abschnitte zu gliedern",
      latex: "LaTeX-Kompilierungsfehler zu beheben",
      feedback: "vor der Einreichung Feedback zum Manuskript einzuholen",
      images: "Bilder von Gleichungen, Tabellen oder Diagrammen in LaTeX umzuwandeln",
      retrieval: "das Manuskript für die Suche zu indexieren",
    },
  },
};

const TEX: Record<string, string> = {
  "\\": "\\textbackslash{}",
  "~": "\\textasciitilde{}",
  "^": "\\textasciicircum{}",
};
/** Model ids are user-typed (`qwen2.5:7b-q4_K_M`): escape every LaTeX special, in one pass. */
const tex = (s: string) => s.replace(/[\\{}$&#%_~^]/g, (c) => TEX[c] ?? `\\${c}`);

const day = (t: number) => new Date(t).toISOString().slice(0, 10);

/**
 * The AI-use declaration for a manuscript, or null when nothing was recorded.
 * Per Elsevier it goes in a separate section at the end of the manuscript,
 * immediately before the references. Actions this build cannot describe are
 * left out rather than guessed.
 */
export function buildDisclosure(events: AiEvent[], lang: Lang): Disclosure | null {
  const known = events.filter((e) => Object.hasOwn(PURPOSE_OF, e.action));
  if (!known.length) return null;
  const t = TEXT[lang];
  const used = new Set(known.map((e) => PURPOSE_OF[e.action]));
  const purposes = PURPOSES.filter((p) => used.has(p)).map((p) => t.purposes[p]);
  const models = [...new Set(known.map((e) => e.model))].sort();
  const times = known.map((e) => e.createdAt.getTime());
  // ListFormat joins naturally per language ("a, b, and c" / "a, b e indexar…" / "a und b").
  const list = new Intl.ListFormat(lang, { type: "conjunction" }).format(purposes);
  return {
    latex: `\\section*{${t.title}}\n${t.body(models.map(tex).join(", "), list)}\n`,
    purposes,
    models,
    from: day(times.reduce((a, b) => Math.min(a, b))),
    to: day(times.reduce((a, b) => Math.max(a, b))),
    count: known.length,
  };
}
