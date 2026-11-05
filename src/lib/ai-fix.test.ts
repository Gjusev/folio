import { describe, expect, it } from "vitest";
import { applyLinePatch, buildFixMessages, numberedWindow, parseFixPatch } from "@/lib/ai-fix";

const DOC = [
  "\\documentclass{article}",
  "\\begin{document}",
  ...Array.from({ length: 40 }, (_, i) => `Body line ${i + 1} of the document.`),
  "\\end{document}",
].join("\n");

describe("numberedWindow", () => {
  it("centers the window on the line and formats rows as '  42| text'", () => {
    const w = numberedWindow(DOC, 24, 3);
    expect(w).toMatchObject({ start: 21, end: 27 });
    expect(w.text.split("\n")[0]).toBe("  21| Body line 19 of the document.");
    expect(w.text.split("\n")[3]).toBe("  24| Body line 22 of the document.");
  });

  it("clamps to the file at both ends and to line 1 minimum", () => {
    expect(numberedWindow(DOC, 2, 30)).toMatchObject({ start: 1, end: 32 });
    expect(numberedWindow(DOC, 10_000, 30)).toMatchObject({
      start: DOC.split("\n").length - 30,
      end: DOC.split("\n").length,
    });
    expect(numberedWindow("only line", 5)).toMatchObject({ start: 1, end: 1 });
  });
});

describe("buildFixMessages", () => {
  const c = {
    path: "main.tex",
    error: { message: "Undefined control sequence.", line: 12 },
    window: numberedWindow(DOC, 12, 5),
    logTail: "./main.tex:12: Undefined control sequence.",
  };

  it("demands one JSON object and embeds the error, window and log", () => {
    const messages = buildFixMessages(c);
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe("system");
    const user = String(messages[1].content);
    expect(user).toContain("Undefined control sequence. (line 12)");
    expect(user).toContain("main.tex");
    expect(user).toContain("  12| ");
    expect(user).toContain("./main.tex:12:");
    const system = messages[0].content;
    expect(system).toContain("ONE JSON object");
    expect(system).toContain('"startLine"');
    expect(system).toContain("MINIMAL");
    expect(system).toContain("untrusted data");
  });

  it("names the explanation language when given, English otherwise", () => {
    expect(buildFixMessages(c, "es")[0].content).toContain("Spanish");
    expect(buildFixMessages(c, "de")[0].content).toContain("German");
    expect(buildFixMessages(c)[0].content).not.toContain("Spanish");
  });
});

describe("parseFixPatch", () => {
  const window = { start: 10, end: 30 };
  const good = JSON.stringify({
    explanation: "The \\si command needs siunitx.",
    startLine: 12,
    endLine: 12,
    replacement: "The mass is 3\\,kg.",
  });

  it("accepts a clean object, fences and prose around it", () => {
    for (const raw of [good, "```json\n" + good + "\n```", "Here you go:\n" + good]) {
      expect(parseFixPatch(raw, window)).toEqual({
        explanation: "The \\si command needs siunitx.",
        startLine: 12,
        endLine: 12,
        replacement: "The mass is 3\\,kg.",
      });
    }
  });

  it("rejects lines outside the window, start > end and non-integers", () => {
    const patch = (over: Record<string, unknown>) =>
      parseFixPatch(JSON.stringify({ explanation: "x", replacement: "y", ...over }), window);
    expect(patch({ startLine: 9, endLine: 12 })).toBeNull();
    expect(patch({ startLine: 10, endLine: 31 })).toBeNull();
    expect(patch({ startLine: 20, endLine: 15 })).toBeNull();
    expect(patch({ startLine: 12.5, endLine: 12 })).toBeNull();
    expect(patch({ startLine: "12", endLine: 12 })).toBeNull();
  });

  it("rejects a missing replacement, an empty explanation and junk", () => {
    expect(
      parseFixPatch(JSON.stringify({ explanation: "x", startLine: 12, endLine: 12 }), window),
    ).toBeNull();
    expect(
      parseFixPatch(
        JSON.stringify({ explanation: "  ", startLine: 12, endLine: 12, replacement: "y" }),
        window,
      ),
    ).toBeNull();
    expect(parseFixPatch("I cannot do that, sorry.", window)).toBeNull();
    expect(parseFixPatch("{not json", window)).toBeNull();
  });

  it("trims the explanation to 600 characters", () => {
    const raw = JSON.stringify({
      explanation: "x".repeat(800),
      startLine: 12,
      endLine: 12,
      replacement: "y",
    });
    expect(parseFixPatch(raw, window)!.explanation).toHaveLength(600);
  });
});

describe("applyLinePatch", () => {
  const content = ["alpha", "beta", "gamma", "delta"].join("\n");

  it("replaces the inclusive range", () => {
    expect(applyLinePatch(content, 2, 3, "beta\ngamma", "BETA\nGAMMA\nBONUS")).toBe(
      "alpha\nBETA\nGAMMA\nBONUS\ndelta",
    );
    // Delete to nothing: the lines vanish entirely.
    expect(applyLinePatch(content, 2, 2, "beta", "")).toBe("alpha\ngamma\ndelta");
  });

  it("returns null when the lines no longer match the proposal", () => {
    expect(applyLinePatch(content, 2, 3, "beta\nGAMMA", "x")).toBeNull();
    expect(applyLinePatch(content, 1, 4, "alpha\nbeta\ngamma", "x")).toBeNull();
  });

  it("returns null out of range", () => {
    expect(applyLinePatch(content, 0, 2, "alpha\nbeta", "x")).toBeNull();
    expect(applyLinePatch(content, 3, 9, "gamma", "x")).toBeNull();
  });

  it("keeps \\r\\n files \\r\\n (original matched across EOL styles)", () => {
    const crlf = "alpha\r\nbeta\r\ngamma";
    expect(applyLinePatch(crlf, 2, 2, "beta", "BETA")).toBe("alpha\r\nBETA\r\ngamma");
    // The original may arrive \\n-normalized from a \\r\\n file and still apply.
    expect(applyLinePatch(crlf, 2, 2, "beta", "B\nE")).toBe("alpha\r\nB\r\nE\r\ngamma");
  });
});
