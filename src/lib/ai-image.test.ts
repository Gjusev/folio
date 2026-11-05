import { describe, expect, it } from "vitest";
import {
  IMAGE_KINDS,
  buildImageMessages,
  extractLatex,
  sniffImage,
  snippetDocument,
} from "@/lib/ai-image";

describe("sniffImage (magic bytes, never the declared type)", () => {
  const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
  const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46]);
  const gif = new TextEncoder().encode("GIF89a\u0004\u0000");
  const webp = new Uint8Array([
    0x52, 0x49, 0x46, 0x46, 0x24, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50,
  ]);

  it.each([
    ["image/png", png],
    ["image/jpeg", jpeg],
    ["image/gif", gif],
    ["image/webp", webp],
  ] as const)("recognizes %s", (mediaType, bytes) => {
    expect(sniffImage(bytes)).toBe(mediaType);
  });

  it("rejects junk, empty and lookalike buffers", () => {
    expect(sniffImage(new TextEncoder().encode("hello world"))).toBeNull();
    expect(sniffImage(new Uint8Array())).toBeNull();
    // RIFF without the WEBP tag is some other RIFF file (e.g. WAV).
    expect(
      sniffImage(new Uint8Array([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45])),
    ).toBeNull();
  });
});

describe("buildImageMessages", () => {
  it("sends the system prompt and one image turn, kind and hint included", () => {
    const msgs = buildImageMessages({
      kind: "equation",
      hint: " Maxwell's laws ",
      image: { mediaType: "image/png", data: "aWNvbg==" },
    });
    expect(msgs).toHaveLength(2);
    expect(msgs[0].role).toBe("system");
    const system = msgs[0].content as string;
    expect(system).toContain("% unreadable");
    expect(system).toContain("tikz");
    expect(system).toContain("Never \\includegraphics a file that does not exist");
    const turn = msgs[1] as { role: string; content: { type: string }[] };
    expect(turn.role).toBe("user");
    expect(turn.content).toHaveLength(2);
    expect(turn.content[0]).toMatchObject({
      type: "text",
      text: expect.stringContaining("equation"),
    });
    expect(turn.content[0]).toMatchObject({ text: expect.stringContaining("Maxwell's laws") });
    expect(turn.content[1]).toEqual({
      type: "image",
      mediaType: "image/png",
      data: "aWNvbg==",
    });
  });

  it("every kind (auto included) builds; the image never lands in the system prompt", () => {
    for (const kind of IMAGE_KINDS) {
      const msgs = buildImageMessages({ kind, image: { mediaType: "image/gif", data: "R0lGOD" } });
      expect(typeof msgs[0].content).toBe("string");
      expect(msgs[1].content).toHaveLength(2);
    }
  });
});

describe("extractLatex", () => {
  const eq = "\\begin{equation}\n  E = mc^2\n\\end{equation}";

  it("keeps a clean answer as-is", () => {
    expect(extractLatex(`  ${eq} `)).toBe(eq);
  });

  it("unwraps ```latex fences", () => {
    expect(extractLatex("```latex\n" + eq + "\n```")).toBe(eq);
  });

  it("strips leading prose when LaTeX follows", () => {
    expect(extractLatex("Here is the transcription:\n\n" + eq)).toBe(eq);
  });

  it("does not eat prose-only answers (the text kind has no backslash)", () => {
    expect(extractLatex("The quick brown fox.")).toBe("The quick brown fox.");
  });

  it("passes the unreadable marker through", () => {
    expect(extractLatex("% unreadable")).toBe("% unreadable");
    expect(extractLatex("```\n% unreadable\n```")).toBe("% unreadable");
  });
});

describe("snippetDocument", () => {
  it("wraps the snippet in a minimal compilable preamble", () => {
    const doc = snippetDocument("x");
    expect(doc.startsWith("\\documentclass{article}\n")).toBe(true);
    expect(doc).toContain("\\usepackage{amsmath,amssymb,graphicx,booktabs,tikz,pgfplots}");
    expect(doc).toContain("\\pgfplotsset{compat=1.17}");
    expect(doc).toContain("\\begin{document}\nx\n\\end{document}");
  });
});
