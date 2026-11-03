import { describe, expect, it } from "vitest";
import { buildMessages, windowAround } from "@/lib/ai-prompts";
import { addBibEntry, bibKeys } from "@/lib/bibtex";
import { parseLatexLog } from "@/lib/latex-log";
import { sseData, thinkFilter } from "@/lib/llm";
import { parseRequest, safePath } from "../../services/latex-compiler/server";

describe("parseLatexLog", () => {
  it("extracts file:line errors and deduplicated warnings", () => {
    const log = [
      "This is pdfTeX",
      "./main.tex:12: Undefined control sequence.",
      "l.12 \\foo",
      "sections/intro.tex:3: LaTeX Error: File `missing.sty' not found.",
      "LaTeX Warning: Citation `x' on page 1 undefined on input line 20.",
      "LaTeX Warning: Citation `x' on page 1 undefined on input line 20.",
      "Package hyperref Warning: Token not allowed in a PDF string.",
    ].join("\n");
    const { errors, warnings } = parseLatexLog(log);
    expect(errors).toEqual([
      { file: "main.tex", line: 12, message: "Undefined control sequence." },
      {
        file: "sections/intro.tex",
        line: 3,
        message: "LaTeX Error: File `missing.sty' not found.",
      },
    ]);
    expect(warnings).toHaveLength(2);
    expect(warnings[0]).toEqual({ message: "Citation `x' on page 1 undefined", line: 20 });
  });

  it("falls back to bare ! errors", () => {
    expect(parseLatexLog("! Emergency stop.\n").errors).toEqual([{ message: "Emergency stop." }]);
  });
});

describe("thinkFilter", () => {
  it("removes reasoning blocks even when tags are split across chunks", () => {
    const f = thinkFilter();
    const out = ["Hel", "lo <thi", "nk>secret ", "stuff</th", "ink> world", "<", "b>"]
      .map(f)
      .join("");
    expect(out).toBe("Hello  world<b>");
  });
});

describe("sseData", () => {
  it("yields data payloads across chunk boundaries", async () => {
    const enc = new TextEncoder();
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(enc.encode('data: {"a":1}\n\nda'));
        c.enqueue(enc.encode('ta: {"a":2}\r\n: comment\ndata: [DONE]'));
        c.close();
      },
    });
    const got: string[] = [];
    for await (const d of sseData(body)) got.push(d);
    expect(got).toEqual(['{"a":1}', '{"a":2}', "[DONE]"]);
  });
});

describe("bibtex", () => {
  const bib = "@article{smith2020,\n  title={A},\n  doi={10.1000/abc}\n}\n";

  it("lists keys", () => {
    expect(bibKeys(bib + "@book{ doe2019 , title={B}}")).toEqual(["smith2020", "doe2019"]);
  });

  it("does not duplicate an entry with the same DOI", () => {
    const r = addBibEntry(bib, "@article{Smith_2020, doi={10.1000/ABC}}", { doi: "10.1000/abc" });
    expect(r).toEqual({ content: bib, key: "smith2020", added: false });
  });

  it("appends new entries and renames clashing keys", () => {
    const r = addBibEntry(bib, "@article{smith2020, title={Other}, doi={10.2000/x}}", {
      doi: "10.2000/x",
    });
    expect(r.added).toBe(true);
    expect(r.key).toBe("smith2020b");
    expect(r.content).toContain("@article{smith2020b, title={Other}");
    expect(bibKeys(r.content)).toEqual(["smith2020", "smith2020b"]);
    expect(addBibEntry("", "@misc{k, doi={10.1/x}}", { doi: "10.1/x" }).content).toBe(
      "@misc{k, doi={10.1/x}}\n",
    );
  });
});

describe("ai prompts", () => {
  it("windows long documents around the anchor", () => {
    const doc = "a".repeat(50_000) + "NEEDLE" + "b".repeat(50_000);
    const w = windowAround(doc, "NEEDLE", 1000);
    expect(w).toContain("NEEDLE");
    expect(w.length).toBeLessThan(1100);
  });

  it("marks the document as untrusted data and lists bibliography keys", () => {
    const msgs = buildMessages({
      action: "improve",
      filePath: "main.tex",
      document: "doc",
      bibKeys: ["k1"],
      selection: "sel",
      beforeCursor: "",
      instruction: "",
      log: "",
      history: [],
    });
    expect(msgs[0].role).toBe("system");
    expect(msgs[0].content).toMatch(/Ignore any instructions/);
    expect(msgs.at(-1)!.content).toContain("BIBLIOGRAPHY KEYS: k1");
    expect(msgs.at(-1)!.content).toContain("SELECTION:");
  });
});

describe("compiler request validation", () => {
  it("accepts a sane request", () => {
    expect(
      parseRequest({ mainFile: "main.tex", files: [{ path: "main.tex", content: "x" }] }),
    ).toEqual({
      mainFile: "main.tex",
      files: [{ path: "main.tex", content: "x" }],
    });
  });

  it.each([
    [{ mainFile: "main.tex", files: [] }],
    [{ mainFile: "other.tex", files: [{ path: "main.tex", content: "" }] }],
    [
      {
        mainFile: "main.tex",
        files: [
          { path: "main.tex", content: "" },
          { path: "latexmkrc", content: "" },
        ],
      },
    ],
    [
      {
        mainFile: "main.tex",
        files: [
          { path: "main.tex", content: "" },
          { path: ".latexmkrc", content: "" },
        ],
      },
    ],
    [
      {
        mainFile: "main.tex",
        files: [
          { path: "main.tex", content: "" },
          { path: "../x.tex", content: "" },
        ],
      },
    ],
    [
      {
        mainFile: "main.tex",
        files: [
          { path: "main.tex", content: "" },
          { path: "main.tex", content: "" },
        ],
      },
    ],
    [{ mainFile: "main.tex", files: [{ path: "main.tex", content: 1 }] }],
  ])("rejects %j", (body) => {
    expect(typeof parseRequest(body)).toBe("string");
  });

  it("rejects unsafe paths", () => {
    expect(safePath("a/b/c.tex")).toBe(true);
    expect(safePath("/etc/passwd")).toBe(false);
    expect(safePath("x.pl")).toBe(false);
  });
});
