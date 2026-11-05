import { describe, expect, it } from "vitest";
import { buildDisclosure, type AiEvent } from "@/lib/ai-disclosure";

const ev = (action: string, model: string, iso: string): AiEvent => ({
  action,
  model,
  createdAt: new Date(iso),
});

// Deliberately out of order: the builder must not trust the ledger's ordering.
const events = [
  ev("draft", "gpt-5-mini", "2026-03-04T23:30:00Z"),
  ev("improve", "gpt-5-mini", "2026-03-01T08:00:00Z"),
  ev("ask", "claude-sonnet-5.5", "2026-03-02T12:00:00Z"),
];

describe("buildDisclosure", () => {
  it("is null without events, or with only actions it cannot describe", () => {
    expect(buildDisclosure([], "en")).toBeNull();
    expect(buildDisclosure([ev("teleport", "m", "2026-01-01T00:00:00Z")], "en")).toBeNull();
    expect(buildDisclosure([ev("constructor", "m", "2026-01-01T00:00:00Z")], "en")).toBeNull();
  });

  it("writes Elsevier's English declaration from the ledger", () => {
    const d = buildDisclosure(events, "en")!;
    expect(d.latex).toBe(
      "\\section*{Declaration of generative AI and AI-assisted technologies in the manuscript preparation process}\n" +
        "During the preparation of this work, the author(s) used claude-sonnet-5.5, gpt-5-mini through Folio " +
        "in order to answer questions about the manuscript, improve language and readability, and draft text. " +
        "After using this tool/service, the author(s) reviewed and edited the content as needed and take(s) " +
        "full responsibility for the content of the published article.\n",
    );
    expect(d.models).toEqual(["claude-sonnet-5.5", "gpt-5-mini"]);
    expect(d).toMatchObject({ from: "2026-03-01", to: "2026-03-04", count: 3 });
  });

  it("maps actions to purposes once each, in declaration order; embed only when present", () => {
    const all = ["embed", "image", "review", "fix", "plan", "draft", "continue", "improve"]
      .concat(["explain", "ask", "teleport"])
      .map((a) => ev(a, "m", "2026-05-05T00:00:00Z"));
    expect(buildDisclosure(all, "en")!.purposes).toEqual([
      "answer questions about the manuscript",
      "improve language and readability",
      "draft text",
      "outline sections",
      "resolve LaTeX compilation errors",
      "obtain pre-submission feedback on the manuscript",
      "convert images of equations, tables or diagrams to LaTeX",
      "index the manuscript for retrieval",
    ]);
    expect(buildDisclosure(all, "en")!.count).toBe(10); // the unknown action is left out
    const noEmbed = buildDisclosure([ev("explain", "m", "2026-05-05T00:00:00Z")], "en")!;
    expect(noEmbed.purposes).toEqual(["answer questions about the manuscript"]);
    expect(noEmbed.latex).not.toMatch(/index/);
  });

  it("translates the same structure into Spanish and German", () => {
    const es = buildDisclosure(
      [...events, ev("embed", "mistral-embed", "2026-03-03T00:00:00Z")],
      "es",
    )!;
    expect(es.latex).toMatch(
      /^\\section\*\{Declaración sobre IA generativa y tecnologías asistidas por IA en el proceso de preparación del manuscrito\}\n/,
    );
    expect(es.latex).toContain(
      "el/los autor(es) ha(n) utilizado claude-sonnet-5.5, gpt-5-mini, mistral-embed a través de Folio con el fin de responder preguntas sobre el manuscrito, mejorar la redacción y la legibilidad, redactar texto e indexar el manuscrito",
    );
    expect(es.latex).toContain(
      "asume(n) plena responsabilidad por el contenido del artículo publicado.",
    );

    const de = buildDisclosure(events, "de")!;
    expect(de.latex).toMatch(/^\\section\*\{Erklärung zu generativer KI/);
    expect(de.latex).toContain(
      "hat/haben der/die Autor(en) claude-sonnet-5.5, gpt-5-mini über Folio verwendet, um Fragen zum Manuskript zu beantworten, Sprache und Lesbarkeit zu verbessern und Text zu entwerfen.",
    );
    expect(de.purposes).toHaveLength(3);
  });

  it("escapes LaTeX specials in model names, keeping the raw ids for the UI", () => {
    const raw = "q_w&e%n#$x{y}~z^\\k";
    const d = buildDisclosure([ev("fix", raw, "2026-02-02T00:00:00Z")], "en")!;
    expect(d.latex).toContain(
      "used q\\_w\\&e\\%n\\#\\$x\\{y\\}\\textasciitilde{}z\\textasciicircum{}\\textbackslash{}k through Folio",
    );
    expect(d.models).toEqual([raw]);
  });
});
