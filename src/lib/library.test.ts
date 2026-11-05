import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { closeDb, db, schema } from "@/lib/db";
import {
  deletePaper,
  detectDoi,
  extractPdfText,
  getPaperData,
  listPapers,
  savePaper,
  sniffPdf,
} from "@/lib/library";
import { signUp, tinyPdf } from "../../test/helpers";

afterAll(async () => {
  await closeDb();
});

describe("pdf helpers", () => {
  it("extracts the text of a real (tiny) PDF", async () => {
    const { text, pages, truncated } = await extractPdfText(
      tinyPdf(["Folio personal library", "doi: 10.1000/folio"]),
    );
    expect(pages).toBe(1);
    expect(truncated).toBe(false);
    expect(text).toContain("Folio personal library");
    expect(text).toContain("10.1000/folio");
  });

  it("reports honest truncation at the 400k-char cap", async () => {
    // A dense page: ~450k chars as many short lines (pdf.js extracts lines,
    // not one giant run).
    const dense = Array.from(
      { length: 9000 },
      (_, i) => `linea densa de texto numero ${String(i).padStart(24, "0")}`,
    );
    const { text, truncated } = await extractPdfText(tinyPdf(dense));
    expect(truncated).toBe(true);
    expect(text.length).toBe(400_000);
  });

  it("counts pages of a multi-page PDF", async () => {
    const { pages } = await extractPdfText(tinyPdf(["one line"], 3));
    expect(pages).toBe(3);
  });

  it("sniffs the %PDF- magic", () => {
    expect(sniffPdf(tinyPdf(["x"]))).toBe(true);
    expect(sniffPdf(new TextEncoder().encode("hello world, definitely not a pdf"))).toBe(false);
    expect(sniffPdf(new Uint8Array(3))).toBe(false);
  });

  it("detects the first DOI in free text, tolerating prefixes and trailing dots", () => {
    expect(
      detectDoi("We build on https://doi.org/10.1038/s41586-020-2649-2 and later 10.1234/abc."),
    ).toBe("10.1038/s41586-020-2649-2");
    expect(detectDoi("see 10.1234/abc.def.")).toBe("10.1234/abc.def");
    expect(detectDoi("no identifiers here")).toBeNull();
  });
});

describe("library storage", () => {
  it("saves, lists, serves and deletes a paper (with extracted text and DOI)", async () => {
    const { email } = await signUp();
    const userId = await idOf(email);
    const paper = await savePaper(userId, {
      filename: "gestion-redes.pdf",
      bytes: tinyPdf(["Redes neuronales para todo", "doi: 10.9999/prueba"]),
    });
    expect(paper.title).toBe("gestion-redes"); // filename minus .pdf
    expect(paper.pages).toBe(1);
    expect(paper.text).toBe(true);
    expect(paper.doi).toBe("10.9999/prueba");

    const list = await listPapers(userId);
    expect(list).toHaveLength(1);
    expect(list[0].attachedTo).toEqual([]);

    const bytes = await getPaperData(userId, paper.id);
    expect(sniffPdf(new Uint8Array(bytes.data))).toBe(true);

    // Another user's library stays empty and invisible.
    const other = await signUp();
    expect(await listPapers(await idOf(other.email))).toEqual([]);
    await expect(getPaperData(await idOf(other.email), paper.id)).rejects.toMatchObject({
      status: 404,
    });

    await deletePaper(userId, paper.id);
    expect(await listPapers(userId)).toEqual([]);
  });

  it("still saves a PDF whose text cannot be extracted, with fullText null", async () => {
    const { email } = await signUp();
    const userId = await idOf(email);
    // Valid magic, hopeless content: no objects, no xref — extraction throws.
    const junk = new Uint8Array(64);
    junk.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    const paper = await savePaper(userId, { filename: "broken.pdf", bytes: junk });
    expect(paper.text).toBe(false);
    expect(paper.pages).toBeNull();
    expect(paper.doi).toBeNull();
  });

  it("refuses files over 25 MB with 413", async () => {
    const { email } = await signUp();
    const big = new Uint8Array(25 * 1024 * 1024 + 1);
    big.set([0x25, 0x50, 0x44, 0x46, 0x2d]);
    await expect(
      savePaper(await idOf(email), { filename: "big.pdf", bytes: big }),
    ).rejects.toMatchObject({ status: 413 });
  });

  it("refuses bytes without the %PDF- magic with 415", async () => {
    const { email } = await signUp();
    await expect(
      savePaper(await idOf(email), {
        filename: "photo.png",
        bytes: new TextEncoder().encode("plainly not a pdf"),
      }),
    ).rejects.toMatchObject({ status: 415 });
  });
});

async function idOf(email: string): Promise<string> {
  const [row] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return row.id;
}
