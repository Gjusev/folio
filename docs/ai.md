# AI in Folio

AI is optional. Without a provider every other feature works, and the AI panels
explain how to turn it on. When it is on, three rules hold everywhere:

1. **The model never edits your document.** Every change is a proposal you
   insert or apply yourself.
2. **The model never invents citations.** Cite keys are limited to your `.bib`
   (and, for the drafting agent, to the literature it retrieved); anything else
   is removed on the server before you see it.
3. **The document is untrusted data.** The model has no tools and no
   permissions; instructions inside the manuscript are not followed.

## Providers

Folio speaks two protocols: any **OpenAI-compatible** Chat Completions endpoint
(OpenRouter, OpenAI, Gemini's compatibility endpoint, Mistral, DeepSeek, xAI,
Ollama, vLLM, SGLang, a custom URL) and **Anthropic's native Messages API**.
Settings offers presets for each.

- **Per-user keys (BYOK).** Each user adds providers in Settings. Keys are
  sealed with AES-256-GCM (`LLM_CREDENTIALS_KEY`), never leave the server and
  are never sent back to the browser — the UI only sees whether a key exists.
- **Routing by task.** A cheap model for search queries, a strong one for
  drafting, an embedding model for RAG.
- **The server-wide key.** `LLM_BASE_URL`/`LLM_API_KEY`/`LLM_MODEL` in `.env` is
  available to every user while `LLM_ENV_SHARED=true` (the default, fine for a
  personal instance). On a shared instance set it to `false`.
- **SSRF guard.** User-supplied base URLs that resolve to loopback or private
  addresses are rejected unless `LLM_ALLOW_LOCAL=1` (and the port is in
  `LLM_ALLOWED_LOCAL_PORTS`); redirects are refused.
- **Collaboration.** The assistant always runs with the key of whoever invokes
  it; the collaboration relay only carries text and cursors.

## Features

| Feature        | Where         | What it does                                                                                                                                              |
| -------------- | ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Assistant      | Assistant tab | Improve, explain, continue, fix the last compile error, or ask about the document; conversations are persisted                                            |
| RAG            | Assistant tab | Indexes your `.tex`/`.bib` with your provider's embedding model; answers use the relevant fragments                                                       |
| Drafting agent | Assistant tab | Retrieves real literature, shows it as evidence and streams a section; new references enter your `.bib` only when you accept                              |
| Section plan   | Assistant tab | Plans the paper section by section (persisted); each row drafts with a word budget, a critique pass and citation verification against a throwaway compile |
| Review mode    | Review tab    | A structured critique of the manuscript, described below                                                                                                  |

## Review mode

The author chooses:

- **Scope**: the whole document, or individual sections across `.tex` files
  (the text before the first heading — title and abstract — is a section of its
  own; fragments without headings or a document body, such as TikZ figures, are
  skipped).
- **Aspects**: clarity, structure, argument, evidence, citations, language,
  math, format.
- **Reviewer profile**: a constructive colleague, a fair but rigorous journal
  reviewer, or a demanding "Reviewer 2".
- **Focus** (optional): what to look at especially.

The server sends the selected sections with their real line numbers (up to
60,000 characters; the result says when the selection was clipped) and asks for
one JSON object: a summary, a 1–5 score per aspect and up to 20 comments, each
with aspect, severity, file, line, a verbatim quotation and an optional
suggestion. It then **verifies** the answer:

- comments about aspects that were not requested are dropped;
- a location is kept only if it falls inside a range the model was shown;
  otherwise the comment becomes a "general" comment without a location;
- a quotation is kept only if it really occurs on that line;
- duplicates are removed and comments are sorted by severity.

For citations the model judges form only (claims without a citation, odd
placement, keys not in the bibliography): it cannot see the cited papers and is
told never to say what they contain.

The result is kept per project in your browser. Comments can be filtered by
severity and aspect, opened at their line, dismissed (and restored), and copied
as a Markdown report. Reviews are rate limited to 6 per user every 10 minutes.

## What is tested

Prompts, parsers and the verification steps are unit-tested; the routes are
tested end to end against fake OpenAI-compatible servers (streaming, invented
keys, out-of-range locations, junk answers, rate limits). The drafting
executor was verified live with a fake model and a real compile. **No AI
feature has been verified against a paid model in CI.**
