import { expect, test } from "@playwright/test";
import { tinyPdf } from "../pdf-fixture";
import { seed } from "./helpers";

function b64(bytes: Uint8Array): string {
  let s = "";
  for (const byte of bytes) s += String.fromCharCode(byte);
  return btoa(s);
}

test("subir un PDF extrae texto y DOI", async () => {
  const ctx = await seed();
  const pdf = tinyPdf([
    "Reading note on layer normalization.",
    "Reference DOI 10.1234/folio-e2e.1 in text.",
  ]);
  const up = await ctx.api.post("/api/library", {
    data: { filename: "e2e-layernorm.pdf", data: b64(pdf) },
  });
  expect(up.status(), await up.text()).toBe(201);
  const { paper } = (await up.json()) as {
    paper: { id: string; pages: number | null; doi: string | null; text: boolean };
  };

  // Extraction runs server-side against the real production build: this is
  // the regression test for the missing pdf.worker chunk, which used to leave
  // every upload with text:false and Cite/Attach permanently disabled.
  // (The cite-from-DOI flow needs OpenAlex and stays in the unit tests.)
  expect(paper.pages).toBe(1);
  expect(paper.text).toBe(true);
  expect(paper.doi).toBe("10.1234/folio-e2e.1");

  const list = await ctx.api.get("/api/library");
  expect(list.status()).toBe(200);
  const listed = (await list.json()) as { papers: { id: string }[] };
  expect(listed.papers.some((p) => p.id === paper.id)).toBe(true);

  const del = await ctx.api.delete(`/api/library/${paper.id}`);
  expect(del.status()).toBe(204);
});
