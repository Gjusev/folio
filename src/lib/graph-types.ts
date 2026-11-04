// Contract between the graph API (server) and the literature explorer
// (client). Pure types: safe to import from both sides, no runtime code.

/** How a paper relates to the origin of the graph. */
export type GraphRole =
  | "origin" // the paper the graph was built around
  | "prior" // the origin cites it
  | "derivative" // it cites the origin
  | "related" // neither, but similar (co-cited with the origin / OpenAlex neighbour)
  | "mine"; // bibliography graph: a paper of the user's own .bib

export type GraphNode = {
  id: string; // OpenAlex work id ("W…")
  title: string;
  authors: string[]; // first few authors, for display
  year?: number;
  venue?: string;
  citedBy: number;
  doi?: string;
  role: GraphRole;
  /**
   * Similarity to the origin in [0, 1] (origin = 1). In the bibliography
   * graph: the best similarity to any of the user's own papers.
   */
  sim: number;
  /** References shared with the origin (bibliographic coupling, a count). */
  shared: number;
  /** Papers of the citing sample that cite both this paper and the origin. */
  cocited: number;
  /** How many other papers inside the graph cite this one. */
  inGraphCitedBy: number;
  /** How many papers inside the graph this one cites. */
  inGraphRefs: number;
};

/** Undirected similarity link between two papers of the graph. */
export type GraphEdge = {
  from: string;
  to: string;
  /** Similarity weight in (0, 1]; drives layout distance and line weight. */
  w: number;
  /** One endpoint cites the other; then `from` is the citing paper. */
  direct?: true;
};

/**
 * A work outside the graph worth knowing about: a "prior work" is cited by
 * many graph papers, a "derivative work" cites many of them.
 */
export type OutsideWork = {
  id: string;
  title: string;
  authors: string[];
  year?: number;
  venue?: string;
  citedBy: number;
  doi?: string;
  /** Prior: graph papers that cite it. Derivative: graph papers it cites. */
  links: number;
};

export type CitationGraph = {
  /** Origin work id; empty string in the bibliography view. */
  seed: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  prior: OutsideWork[];
  derivative: OutsideWork[];
  /** True when a source list (references, citers) was capped or partial. */
  truncated: boolean;
};

/** Everything the details panel shows about one work. */
export type PaperDetail = {
  id: string; // OpenAlex id
  title: string;
  authors: string[]; // all of them (capped at 50)
  year?: number;
  venue?: string;
  type?: string; // article, preprint, book-chapter…
  doi?: string;
  arxivId?: string;
  citedBy: number;
  referencesCount: number;
  abstract?: string;
  /** Best free full-text link (PDF or landing page), when one exists. */
  openAccessUrl?: string;
  /** Publisher / landing page, when different from the DOI resolver. */
  landingUrl?: string;
  openalexUrl: string;
  /** Up to 5 topic names, most specific first. */
  topics: string[];
  isOa: boolean;
  /** One-sentence summary from Semantic Scholar, when its free pool answered. */
  tldr?: string;
};

/** What the explorer is opened on: a search hit, a graph node or a bib entry. */
export type GraphSeed = {
  /** "doi": `paperId` is a bare DOI (bibliography entries have no engine id). */
  source: "openalex" | "s2" | "arxiv" | "doi";
  paperId: string;
  title: string;
};
