// Pure parsing tests for the compiler service's auxiliary endpoints.
// The parsers live in services/latex-compiler/server.ts (same import as pure.test.ts).
import { describe, expect, it } from "vitest";
import {
  parseChktex,
  parseSynctex,
  parseSynctexRequest,
  parseTexcount,
} from "../../services/latex-compiler/server";

const files = [{ path: "main.tex", content: "\\documentclass{article}" }];

describe("parseChktex", () => {
  it("maps each -f line to an issue and keeps colons inside the message", () => {
    const raw = [
      "main.tex:3:14:56:Warning:1:Command terminated with space.",
      "main.tex:5:2:40:Warning:13:Intersperse spacing: use `\\,` here",
    ].join("\n");
    expect(parseChktex(raw)).toEqual([
      {
        file: "main.tex",
        line: 3,
        col: 14,
        severity: "Warning",
        code: 1,
        message: "Command terminated with space.",
      },
      {
        file: "main.tex",
        line: 5,
        col: 2,
        severity: "Warning",
        code: 13,
        message: "Intersperse spacing: use `\\,` here",
      },
    ]);
  });

  it("splits on a literal backslash-n if a build prints the format unexpanded", () => {
    const raw =
      "main.tex:3:1:10:Warning:1:Command terminated with space.\\nmain.tex:4:1:10:Warning:1:Again.";
    expect(parseChktex(raw)).toHaveLength(2);
  });

  it("skips lines that do not carry seven parseable fields", () => {
    expect(parseChktex("chktex output\nmain.tex:x:1:1:Warning:1:ok")).toEqual([]);
  });
});

describe("parseTexcount", () => {
  it("takes the last block (the -total grand total) for every metric", () => {
    const raw = [
      "File: sections/intro.tex",
      "Words in text: 10",
      "Words in headers: 4",
      "Number of headers: 1",
      "Number of floats/tables/figures: 1",
      "TOTAL",
      "Words in text: 30",
      "Words in headers: 9",
      "Number of headers: 3",
      "Number of floats/tables/figures: 2",
    ].join("\n");
    expect(parseTexcount(raw)).toEqual({ words: 30, headerWords: 9, headers: 3, floats: 2 });
  });

  it("returns zeros when no metric line is found", () => {
    expect(parseTexcount("Unparseable output")).toEqual({
      words: 0,
      headerWords: 0,
      headers: 0,
      floats: 0,
    });
  });
});

describe("parseSynctex", () => {
  const view = [
    "SyncTeX result begin",
    "Output:main.pdf",
    "Page:1",
    "x:88.74373",
    "y:104.49132",
    "h:88.74373",
    "v:104.49132",
    "W:369.88",
    "H:6.94",
    "before:",
    "offset:0",
    "middle:",
    "after:",
    "Input:./main.tex",
    "Line:3",
    "Column:0",
    "offset:0",
    "Context:",
    "3: text",
    "SyncTeX result end",
  ].join("\n");

  it("reads the first Output block of a view answer, file/line from the query", () => {
    // Real container format (synctex 1.5): view answers carry Output/Page/x/y
    // blocks but NO Input records — the source is the query itself.
    const realView = view
      .split("\n")
      .filter((l) => !l.startsWith("Input:") && !l.startsWith("Line:") && !l.startsWith("Column:"))
      .join("\n");
    expect(parseSynctex(realView, { file: "main.tex", line: 1 })).toEqual({
      file: "main.tex",
      line: 1,
      page: 1,
      x: 88.74373,
      y: 104.49132,
    });
  });

  it("reads the first Input block of an edit answer", () => {
    const edit = [
      "SyncTeX result begin",
      "Input:./main.tex",
      "Line:5",
      "Column:-1",
      "offset:0",
      "Context:",
      "5: hello",
      "Output:main.pdf",
      "Page:1",
      "x:100.5",
      "y:150.25",
      "SyncTeX result end",
    ].join("\n");
    expect(parseSynctex(edit)).toEqual({
      file: "./main.tex",
      line: 5,
      col: -1,
      page: 1,
      x: 100.5,
      y: 150.25,
    });
  });

  it("returns null when there is no Input/Page pair", () => {
    expect(parseSynctex("This is pdfTeX\nno markers")).toBeNull();
  });
});

describe("parseSynctexRequest", () => {
  const base = { mainFile: "main.tex", files };

  it("defaults the view source file to mainFile", () => {
    const parsed = parseSynctexRequest({ ...base, mode: "view", input: { line: 3, col: 1 } });
    expect(parsed).toEqual({ ...base, mode: "view", input: { line: 3, col: 1, file: "main.tex" } });
  });

  it("rejects a view file that escapes the job directory", () => {
    expect(
      parseSynctexRequest({
        ...base,
        mode: "view",
        input: { line: 1, col: 1, file: "../etc/passwd" },
      }),
    ).toBe("invalid input: file");
  });

  it("rejects unknown modes and malformed queries", () => {
    expect(parseSynctexRequest({ ...base, mode: "jump", input: {} })).toBe(
      "mode must be 'view' or 'edit'",
    );
    expect(parseSynctexRequest({ ...base, mode: "view", input: { line: 0, col: 1 } })).toContain(
      "line and col",
    );
    expect(
      parseSynctexRequest({ ...base, mode: "edit", input: { page: 1, x: 10, y: "up" } }),
    ).toContain("page, x and y");
  });

  it("accepts a valid edit query", () => {
    expect(
      parseSynctexRequest({ ...base, mode: "edit", input: { page: 1, x: 10, y: 20 } }),
    ).toEqual({
      ...base,
      mode: "edit",
      input: { page: 1, x: 10, y: 20 },
    });
  });
});
