import { describe, expect, it } from "vitest";
import { LANGS } from "@/lib/i18n/dictionaries";
import { checkFiles } from "@/lib/projects";
import { demoProject } from "./demo";

const keysCited = (tex: string) =>
  [...tex.matchAll(/\\cite\{([^}]+)\}/g)].flatMap((m) => m[1].split(",").map((k) => k.trim()));
const keysDefined = (bib: string) => [...bib.matchAll(/@\w+\{([^,]+),/g)].map((m) => m[1]);

describe.each(LANGS)("demoProject(%s)", (lang) => {
  const demo = demoProject(lang);
  const get = (p: string) => demo.files.find((f) => f.path === p)!.content;

  it("is a valid project: main.tex present, paths and sizes accepted", () => {
    expect(demo.files.some((f) => f.path === "main.tex")).toBe(true);
    expect(() => checkFiles(demo.files)).not.toThrow();
    expect(demo.name.length).toBeGreaterThan(5);
  });

  it("cites only keys that exist in the .bib, and leaves exactly one entry uncited", () => {
    const cited = new Set(keysCited(get("main.tex")));
    const defined = keysDefined(get("references.bib"));
    for (const k of cited) expect(defined).toContain(k);
    expect(defined.filter((k) => !cited.has(k))).toEqual(["bahdanau2015neural"]);
  });

  it("only \\inputs files that ship with the project", () => {
    const inputs = [...get("main.tex").matchAll(/\\input\{([^}]+)\}/g)].map((m) => m[1]);
    expect(inputs.length).toBeGreaterThan(0);
    for (const i of inputs) expect(demo.files.map((f) => f.path)).toContain(`${i}.tex`);
  });

  it("has balanced environments and no leftover template placeholders", () => {
    const tex = get("main.tex");
    const count = (re: RegExp) => (tex.match(re) ?? []).length;
    expect(count(/\\begin\{/g)).toBe(count(/\\end\{/g));
    expect(tex).not.toMatch(/undefined|\$\{|\[object/);
    expect(tex).toMatch(/\\ref\{tab:configs\}/);
  });
});

describe("demo copy differs per language", () => {
  it("each language has its own title", () => {
    const names = new Set(LANGS.map((l) => demoProject(l).name));
    expect(names.size).toBe(LANGS.length);
  });
});
