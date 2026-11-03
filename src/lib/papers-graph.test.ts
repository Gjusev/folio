import { beforeEach, describe, expect, it, vi } from "vitest";
import { bibDois } from "@/lib/bibtex";
import { citationGraph, recommendPapers, type CitationGraph } from "@/lib/papers";

// Minimal OpenAlex records for the graph walk.
const work = (id: string, over: Record<string, unknown> = {}) => ({
  id: `https://openalex.org/${id}`,
  doi: `https://doi.org/10.1/${id}`,
  display_name: `Paper ${id}`,
  publication_year: 2015,
  authorships: [{ author: { display_name: "A. Author" } }],
  primary_location: { source: { display_name: "Venue" } },
  cited_by_count: 1,
  referenced_works: [],
  ...over,
});

function mockApi(
  routes: {
    match: (url: string, init?: RequestInit) => boolean;
    reply: unknown;
    status?: number;
  }[],
) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(async (input: unknown, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      for (const r of routes) {
        if (r.match(url, init)) return Response.json(r.reply, { status: r.status ?? 200 });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("bibDois", () => {
  it("extracts, dedups, strips prefixes and rejects junk", () => {
    const bib = `
@article{a, title = {X}, doi = {10.1038/nature14539},}
@article{b, doi = "https://doi.org/10.1000/missing-comma"
@article{c, doi = {not-a-doi},}
@article{d, doi = {10.1038/nature14539},}
`;
    expect(bibDois(bib)).toEqual(["10.1038/nature14539", "10.1000/missing-comma"]);
    expect(bibDois("@article{x,y=1}")).toEqual([]);
  });
});

describe("citationGraph", () => {
  it("walks references, ring 2 of the top hub and citers", async () => {
    const spy = mockApi([
      {
        match: (u) => u.includes("/works/W100") && !u.includes("filter"),
        reply: work("W100", {
          cited_by_count: 900,
          referenced_works: ["https://openalex.org/W1", "https://openalex.org/W2"],
        }),
      },
      {
        match: (u) =>
          u.includes("filter=ids.openalex%3AW1%7CW2") || u.includes("ids.openalex:W1|W2"),
        reply: { results: [work("W1", { cited_by_count: 50 }), work("W2", { cited_by_count: 5 })] },
      },
      {
        match: (u) => u.includes("/works/W1") && !u.includes("filter"),
        reply: work("W1", {
          cited_by_count: 50,
          referenced_works: ["https://openalex.org/W2", "https://openalex.org/W3"],
        }),
      },
      {
        // W2 also gets a ring-2 expansion (top-10 by citations); it cites nothing new.
        match: (u) => u.includes("/works/W2") && !u.includes("filter"),
        reply: work("W2", { cited_by_count: 5, referenced_works: [] }),
      },
      {
        match: (u) => u.includes("ids.openalex%3AW3"),
        reply: { results: [work("W3", { publication_year: 1998 })] },
      },
      {
        match: (u) => u.includes("filter=cites"),
        reply: { results: [work("W9", { cited_by_count: 77 })], meta: { has_more: false } },
      },
    ]);
    const g: CitationGraph = await citationGraph("openalex", "W100");
    const ids = g.nodes.map((n) => n.id);
    expect(ids).toEqual(["W100", "W1", "W2", "W3", "W9"]);
    const byId = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    expect(byId.W100.ring).toBe(0);
    expect(byId.W1.ring).toBe(1);
    expect(byId.W3.ring).toBe(2);
    expect(byId.W9.citedBy).toBe(77);
    expect(g.edges).toEqual([
      { from: "W100", to: "W1" },
      { from: "W100", to: "W2" },
      { from: "W1", to: "W2" },
      { from: "W1", to: "W3" },
      { from: "W9", to: "W100" },
    ]);
    expect(g.truncated).toBe(false);
    spy.mockRestore();
  });

  it("rejects other sources without a DOI", async () => {
    const spy = mockApi([
      {
        match: (u) => u.includes("arxiv.org"),
        reply: `<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><entry><id>http://arxiv.org/abs/2401.1v1</id><published>2024-01-01T00:00:00Z</published><title>No doi</title><summary>s</summary><author><name>A</name></author></entry></feed>`,
      },
    ]);
    await expect(citationGraph("arxiv", "2401.12345")).rejects.toThrow(/DOI/);
    spy.mockRestore();
  });
});

describe("recommendPapers", () => {
  const s2Paper = {
    paperId: "abc",
    title: "Rec 1",
    year: 2024,
    citationCount: 3,
    authors: [{ name: "B" }],
    publicationTypes: ["JournalArticle"],
  };

  it("uses Semantic Scholar list recommendations over DOIs", async () => {
    let sentBody = "";
    const spy = mockApi([
      {
        match: (u, init) =>
          u.includes("api.semanticscholar.org/recommendations") &&
          ((sentBody = String(init?.body)), true),
        reply: { recommendedPapers: [s2Paper] },
      },
    ]);
    const r = await recommendPapers({ dois: ["10.1/a", "10.1/b"] }, 10);
    expect(r.engine).toBe("s2-list");
    expect(r.results[0]).toMatchObject({ source: "s2", title: "Rec 1" });
    expect(JSON.parse(sentBody)).toEqual({ positivePaperIds: ["DOI:10.1/a", "DOI:10.1/b"] });
    spy.mockRestore();
  });

  it("falls back to OpenAlex related works when S2 is throttled", async () => {
    const spy = mockApi([
      {
        match: (u) => u.includes("api.semanticscholar.org/recommendations"),
        reply: { error: "Too Many Requests" },
        status: 429,
      },
      {
        // The single-work lookup MUST ask for related_works in its select,
        // or the fallback silently reads an absent field and dies.
        match: (u) =>
          (u.includes("/works/doi%3A") || u.includes("/works/doi:")) && u.includes("related_works"),
        reply: work("W1", { related_works: ["https://openalex.org/W5"] }),
      },
      {
        match: (u) => u.includes("ids.openalex%3AW5"),
        reply: { results: [work("W5", { cited_by_count: 42 })] },
      },
    ]);
    const r = await recommendPapers({ dois: ["10.1/a"] }, 10);
    expect(r.engine).toBe("openalex-related");
    expect(r.results[0]).toMatchObject({ source: "openalex", id: "W5" });
    spy.mockRestore();
  });

  it("gives up honestly when nothing resolves", async () => {
    const spy = mockApi([
      {
        match: (u) => u.includes("api.semanticscholar.org/recommendations"),
        reply: { recommendedPapers: [] },
      },
      {
        match: (u) => u.includes("/works/doi"),
        reply: work("W1", { related_works: [] }),
      },
    ]);
    await expect(recommendPapers({ dois: ["10.1/a"] }, 10)).rejects.toThrow(/reintenta/i);
    spy.mockRestore();
  });
});
