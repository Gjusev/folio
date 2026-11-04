import { beforeEach, describe, expect, it, vi } from "vitest";
import { bibDois } from "@/lib/bibtex";
import { recommendPapers } from "@/lib/papers";
import { bibliographyGraph, citationGraph, paperDetail } from "@/lib/citation-graph";
import type { CitationGraph } from "@/lib/graph-types";

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

type Route = { match: (url: string) => boolean; reply: unknown; status?: number };

function mockApi(routes: Route[]) {
  return vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
    const url = String(input instanceof Request ? input.url : input);
    for (const r of routes) {
      if (r.match(url)) return Response.json(r.reply, { status: r.status ?? 200 });
    }
    throw new Error(`unexpected fetch: ${url}`);
  });
}

const listCalls = (spy: ReturnType<typeof mockApi>) =>
  spy.mock.calls
    .map((c) => String(c[0]))
    .filter((u) => u.includes("/works?") || u.includes("filter="));

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

describe("citationGraph (similarity engine)", () => {
  // A small, fully deterministic field:
  //   W100 → W1, W2 (references)   W9 → W100, W1   W10 → W100
  const routes = (): Route[] => [
    {
      match: (u) => u.includes("/works/W100") && !u.includes("filter"),
      reply: work("W100", {
        cited_by_count: 900,
        referenced_works: ["https://openalex.org/W1", "https://openalex.org/W2"],
      }),
    },
    {
      match: (u) => u.includes("ids.openalex"),
      reply: {
        results: [
          work("W1", {
            cited_by_count: 50,
            referenced_works: ["https://openalex.org/W2", "https://openalex.org/W3"],
          }),
          work("W2", { cited_by_count: 5, referenced_works: [] }),
        ],
      },
    },
    {
      match: (u) => u.includes("filter=cites"),
      reply: {
        results: [
          work("W9", {
            referenced_works: ["https://openalex.org/W100", "https://openalex.org/W1"],
          }),
          work("W10", { referenced_works: ["https://openalex.org/W100"] }),
        ],
        meta: { has_more: false },
      },
    },
  ];

  it("builds the graph with roles and similarity within the list-call budget, and caches", async () => {
    const spy = mockApi(routes());
    const g: CitationGraph = await citationGraph("openalex", "W100");

    // Roles: the origin cites W1/W2 (prior); W9/W10 cite it (derivative).
    const by = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    expect(by.W100).toMatchObject({ role: "origin", sim: 1 });
    expect(by.W1.role).toBe("prior");
    expect(by.W2.role).toBe("prior");
    expect(by.W9.role).toBe("derivative");
    expect(by.W10.role).toBe("derivative");
    // Similarity is ordered after the origin and bounded.
    expect(by.W9.sim).toBeGreaterThan(by.W10.sim); // shares a reference + cites the origin
    for (const n of g.nodes) {
      expect(n.sim).toBeGreaterThanOrEqual(0);
      expect(n.sim).toBeLessThanOrEqual(1);
    }
    // No orphan nodes, edges carry weights in (0,1].
    const deg = new Map(g.nodes.map((n) => [n.id, 0]));
    for (const e of g.edges) {
      expect(e.w).toBeGreaterThan(0);
      deg.set(e.from, (deg.get(e.from) ?? 0) + 1);
      deg.set(e.to, (deg.get(e.to) ?? 0) + 1);
    }
    expect([...deg.values()].every((d) => d > 0)).toBe(true);
    expect(g.truncated).toBe(false);
    // Budget: references batch + citers. No ring batch (nothing co-cited that
    // is not known) and no prior batch (nothing cited by ≥2 graph papers).
    expect(listCalls(spy).length).toBeLessThanOrEqual(4);

    // The cache serves a second identical request without touching OpenAlex.
    const callsBefore = spy.mock.calls.length;
    await citationGraph("openalex", "W100");
    expect(spy.mock.calls.length).toBe(callsBefore);
    spy.mockRestore();
  });

  it("fetches references and citers in parallel", async () => {
    const started: string[] = [];
    let releaseCiters!: () => void;
    const citersGate = new Promise<void>((res) => (releaseCiters = res));
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/works/W500"))
        return Response.json(work("W500", { referenced_works: ["https://openalex.org/W1"] }));
      if (url.includes("ids.openalex")) {
        started.push("refs");
        return Response.json({ results: [work("W1")] }); // resolves immediately
      }
      if (url.includes("filter=cites")) {
        started.push("citers");
        await citersGate; // held until both phases are provably in flight
        return Response.json({ results: [], meta: {} });
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    const building = citationGraph("openalex", "W500");
    await vi.waitFor(() => expect(started).toEqual(["refs", "citers"]));
    releaseCiters();
    await building;
    spy.mockRestore();
  });

  it("survives a citing sample of zero (duplicate-record case) and still builds", async () => {
    const spy = mockApi([
      {
        match: (u) => u.includes("/works/W300") && !u.includes("filter"),
        reply: work("W300", { referenced_works: ["https://openalex.org/W1"] }),
      },
      { match: (u) => u.includes("ids.openalex"), reply: { results: [work("W1")] } },
      {
        match: (u) => u.includes("filter=cites"),
        reply: { results: [], meta: { has_more: false } },
      },
    ]);
    const g = await citationGraph("openalex", "W300");
    expect(g.nodes.map((n) => n.id)).toContain("W1");
    expect(g.derivative).toEqual([]);
    spy.mockRestore();
  });

  it("keeps a partial graph with truncated=true when the citers call fails", async () => {
    const spy = mockApi([
      {
        match: (u) => u.includes("/works/W400") && !u.includes("filter"),
        reply: work("W400", { referenced_works: ["https://openalex.org/W1"] }),
      },
      { match: (u) => u.includes("ids.openalex"), reply: { results: [work("W1")] } },
      { match: (u) => u.includes("filter=cites"), reply: { error: "boom" }, status: 500 },
    ]);
    const g = await citationGraph("openalex", "W400");
    expect(g.truncated).toBe(true);
    expect(g.nodes.map((n) => n.id).sort()).toEqual(["W1", "W400"]);
    spy.mockRestore();
  });

  it("shares one construction between concurrent identical requests", async () => {
    let hits = 0;
    const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/works/W200") && !url.includes("filter"))
        return Response.json(work("W200", { referenced_works: ["https://openalex.org/W1"] }));
      if (url.includes("ids.openalex")) {
        hits++;
        return Response.json({ results: [work("W1")] });
      }
      if (url.includes("filter=cites")) return Response.json({ results: [], meta: {} });
      throw new Error(`unexpected fetch: ${url}`);
    });
    const [a, b] = await Promise.all([
      citationGraph("openalex", "W200"),
      citationGraph("openalex", "W200"),
    ]);
    expect(hits).toBe(1);
    expect(a).toEqual(b);
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

describe("bibliographyGraph", () => {
  it("seeds are 'mine', the ring is 'prior', and seed→seed citations show up", async () => {
    const spy = mockApi([
      {
        match: (u) => u.includes("/works/doi%3A10.1%2Fa") || u.includes("/works/doi:10.1/a"),
        reply: work("WA", {
          display_name: "My first paper",
          referenced_works: ["https://openalex.org/WB", "https://openalex.org/WR"],
        }),
      },
      {
        match: (u) => u.includes("/works/doi%3A10.1%2Fb") || u.includes("/works/doi:10.1/b"),
        reply: work("WB", {
          display_name: "My second paper",
          referenced_works: ["https://openalex.org/WR"],
        }),
      },
      {
        match: (u) => u.includes("ids.openalex"),
        reply: { results: [work("WR", { display_name: "A shared reference" })] },
      },
    ]);
    const g = await bibliographyGraph(["10.1/a", "10.1/b"]);
    expect(g.seed).toBe("");
    const by = Object.fromEntries(g.nodes.map((n) => [n.id, n]));
    expect(by.WA.role).toBe("mine");
    expect(by.WB.role).toBe("mine");
    expect(by.WR.role).toBe("prior");
    const seedEdge = g.edges.find((e) => e.from === "WA" && e.to === "WB");
    expect(seedEdge?.direct).toBe(true); // my first paper cites my second
    spy.mockRestore();
  });
});

describe("paperDetail", () => {
  const detailWork = {
    ...work("W55"),
    doi: "https://doi.org/10.48550/arXiv.1706.03762",
    display_name: "Attention Is All You Need",
    publication_year: 2017,
    type: "article",
    referenced_works_count: 41,
    abstract_inverted_index: { All: [2], Attention: [0], Is: [1], Need: [4], You: [3] },
    topics: [{ display_name: "Machine learning" }, { display_name: "Artificial neural network" }],
    best_oa_location: { pdf_url: "https://arxiv.org/pdf/1706.03762" },
    open_access: { is_oa: true, oa_url: "https://arxiv.org/abs/1706.03762" },
  };

  it("reconstructs the abstract, extracts topics/OA/arXiv and survives an S2 throttle", async () => {
    const spy = mockApi([
      { match: (u) => u.includes("/works/W55"), reply: detailWork },
      {
        match: (u) => u.includes("semanticscholar.org"),
        reply: { error: "slow down" },
        status: 429,
      },
    ]);
    const d = await paperDetail("W55");
    expect(d.abstract).toBe("Attention Is All You Need");
    expect(d.topics).toEqual(["Machine learning", "Artificial neural network"]);
    expect(d.arxivId).toBe("1706.03762");
    expect(d.openAccessUrl).toBe("https://arxiv.org/pdf/1706.03762");
    expect(d.isOa).toBe(true);
    expect(d.referencesCount).toBe(41);
    expect(d.tldr).toBeUndefined(); // throttled: silent, not an error
    spy.mockRestore();
  });

  it("adds the one-sentence summary when Semantic Scholar answers", async () => {
    const spy = mockApi([
      {
        match: (u) => u.includes("/works/W56"),
        reply: { ...detailWork, id: "https://openalex.org/W56" },
      },
      {
        match: (u) => u.includes("semanticscholar.org"),
        reply: { tldr: { text: "Transformers do away with recurrence." } },
      },
    ]);
    const d = await paperDetail("W56");
    expect(d.tldr).toBe("Transformers do away with recurrence.");
    spy.mockRestore();
  });

  it("validates the id honestly", async () => {
    await expect(paperDetail("nonsense")).rejects.toThrow(/OpenAlex/);
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
        match: (u) =>
          u.includes("api.semanticscholar.org/recommendations") && ((sentBody = "sent"), true),
        reply: { recommendedPapers: [s2Paper] },
      },
    ]);
    const r = await recommendPapers({ dois: ["10.1/a", "10.1/b"] }, 10);
    expect(r.engine).toBe("s2-list");
    expect(r.results[0]).toMatchObject({ source: "s2", title: "Rec 1" });
    expect(sentBody).toBe("sent");
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
        match: (u) =>
          (u.includes("/works/doi%3A") || u.includes("/works/doi:")) && u.includes("related_works"),
        reply: work("W1", { related_works: ["https://openalex.org/W5"] }),
      },
      {
        match: (u) => u.includes("ids.openalex%3AW5") || u.includes("W5"),
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
      { match: (u) => u.includes("/works/doi"), reply: work("W1", { related_works: [] }) },
    ]);
    await expect(recommendPapers({ dois: ["10.1/a"] }, 10)).rejects.toThrow(/reintenta/i);
    spy.mockRestore();
  });
});
