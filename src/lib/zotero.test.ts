import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpError } from "@/lib/http";
import { fetchBibtex, mergeBibtex, verifyKey } from "@/lib/zotero";

afterEach(() => vi.unstubAllGlobals());

const stubFetch = (impl: (url: string, init?: RequestInit) => Promise<unknown>) => vi.fn(impl);

describe("mergeBibtex", () => {
  // What the project's .bib already has: a Folio entry and a hand-written one.
  const bib = [
    "@article{lecun2015deep,",
    "  title       = {{Deep learning}},",
    "  author      = {LeCun, Yann},",
    "  doi         = {10.1038/nature14539},",
    "}",
    "@misc{shannon2001mm,",
    "  title       = {{Mathematical theory of communication}},",
    "  doi         = {10.1109/9780470544242},",
    "}",
  ].join("\n");

  // Zotero's format=bibtex output: tab-indented, trailing comma, braced titles.
  const zoteroDump = [
    "@article{lecun2015deep,\n\ttitle = {Deep {Learning}},\n\tdoi = {10.1038/nature14539},\n}",
    "@misc{shannon2001,\n\ttitle = {A {Mathematical} {Theory} of {Communication}},\n\tdoi = {https://doi.org/10.1109/9780470544242},\n}",
    "@article{devlin2019bert,\n\ttitle = {{BERT}: Pre-training of {Deep} {Bidirectional} {Transformers}},\n\tdoi = {10.18653/v1/N19-1423},\n}",
    "@book{sutton2018rl,\n\ttitle = {Reinforcement {Learning}: {An} {Introduction}},\n\tpublisher = {MIT Press},\n}",
    "@inproceedings{vaswani2017attention,\n\ttitle = {Attention {Is} {All} {You} {Need}},\n\tbooktitle = {NIPS},\n\tdoi = {10.5555/3295222},\n}",
  ].join("\n");

  it("adds the 3 new works and counts the 2 DOI duplicates", () => {
    const { content, added, duplicates } = mergeBibtex(bib, zoteroDump);
    expect(added).toBe(3);
    expect(duplicates).toBe(2);
    // Duplicates are left byte-for-byte as they were.
    expect(content).toContain("@article{lecun2015deep,");
    expect(content).toContain("doi         = {10.1038/nature14539},");
    // New entries arrive appended.
    expect(content).toContain("@article{devlin2019bert,");
    expect(content).toContain("@book{sutton2018rl,");
    expect(content).toContain("@inproceedings{vaswani2017attention,");
  });

  it("also dedups by title when neither side has a DOI", () => {
    const r = mergeBibtex(
      "@misc{a,\n  title = {{Some Title}},\n}\n",
      "@misc{b,\n\ttitle = {Some {Title}},\n}",
    );
    expect(r).toMatchObject({ added: 0, duplicates: 1 });
  });

  it("leaves the .bib untouched when every entry is a duplicate", () => {
    const r = mergeBibtex(
      bib,
      "@article{lecun2015deep,\n\ttitle = {Deep {Learning}},\n\tdoi = {10.1038/nature14539},\n}",
    );
    expect(r).toMatchObject({ added: 0, duplicates: 1 });
    expect(r.content).toBe(bib);
  });
});

describe("verifyKey", () => {
  it("rejects a revoked key (403) with a clear message", async () => {
    const fetchMock = stubFetch(async () => ({ ok: false, status: 403 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(verifyKey("x".repeat(24))).rejects.toSatisfy((err: unknown) => {
      return err instanceof HttpError && err.status === 400 && /no es válida/.test(err.message);
    });
  });

  it("rejects an unknown key (404, the live answer for bad keys)", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch(async () => ({ ok: false, status: 404 })),
    );
    await expect(verifyKey("x".repeat(24))).rejects.toSatisfy(
      (err: unknown) => err instanceof HttpError && err.status === 400,
    );
  });

  it("returns the userID when the key can read the library", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ key: "k", userID: 475425, access: { user: { library: true } } }),
      })),
    );
    await expect(verifyKey("k".repeat(24))).resolves.toBe(475425);
  });

  it("rejects a key without library access", async () => {
    vi.stubGlobal(
      "fetch",
      stubFetch(async () => ({
        ok: true,
        status: 200,
        json: async () => ({ key: "k", userID: 1, access: { user: { library: false } } }),
      })),
    );
    await expect(verifyKey("k".repeat(24))).rejects.toSatisfy(
      (err: unknown) => err instanceof HttpError && err.status === 400,
    );
  });
});

describe("fetchBibtex", () => {
  const creds = { apiKey: "K".repeat(24), userId: 123 };

  it("asks the exact collection URL with the documented params and headers", async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, status: 200, text: async () => "" }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchBibtex(creds, "ABCD1234");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe(
      "https://api.zotero.org/users/123/collections/ABCD1234/items?format=bibtex&limit=100",
    );
    expect(init.headers.Authorization).toBe(`Bearer ${creds.apiKey}`);
    expect(init.headers["Zotero-API-Version"]).toBe("3");
  });

  it("asks the whole-library URL when no collection is given", async () => {
    const fetchMock = stubFetch(async () => ({ ok: true, status: 200, text: async () => "" }));
    vi.stubGlobal("fetch", fetchMock);
    await fetchBibtex(creds);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.zotero.org/users/123/items?format=bibtex&limit=100",
    );
  });
});
