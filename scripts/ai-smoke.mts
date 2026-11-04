// scripts/ai-smoke.mts
// Exercises the AI features against the provider configured for a real
// account, over HTTP, exactly as the browser does:
//   AI_SMOKE_URL=https://folio.mokka-dev.de AI_SMOKE_EMAIL=… AI_SMOKE_PASSWORD=… node scripts/ai-smoke.mts
// Creates one demo project, reviews it, asks the assistant, deletes the project.
const BASE = process.env.AI_SMOKE_URL ?? "http://127.0.0.1:3210";
const EMAIL = process.env.AI_SMOKE_EMAIL ?? "";
const PASSWORD = process.env.AI_SMOKE_PASSWORD ?? "";
if (!EMAIL || !PASSWORD) throw new Error("Set AI_SMOKE_EMAIL and AI_SMOKE_PASSWORD");

let cookie = "";
async function call(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: { "content-type": "application/json", cookie },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const set = res.headers.get("set-cookie");
  if (set) cookie = set.split(";")[0];
  return res;
}

const results: { check: string; ok: boolean; detail: string }[] = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push({ check: name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
};

const login = await call("POST", "/api/auth/login", { email: EMAIL, password: PASSWORD });
check("login", login.ok, String(login.status));
if (!login.ok) process.exit(1);

const demo = await (await call("POST", "/api/projects/demo", { lang: "en" })).json();
const id: string = demo.project.id;
const detail = await (await call("GET", `/api/projects/${id}`)).json();
const main = (detail.files as { id: string; path: string; content: string }[]).find(
  (f) => f.path === "main.tex",
)!;
const lines = main.content.split("\n");

try {
  // 1. Review mode: valid structure, verified locations, every requested aspect respected.
  const t0 = Date.now();
  const rv = await call("POST", `/api/projects/${id}/review`, {
    lang: "en",
    aspects: [
      "clarity",
      "structure",
      "argument",
      "evidence",
      "citations",
      "language",
      "math",
      "format",
    ],
    rigor: "strict",
    focus: "",
    scope: "all",
  });
  const rvBody = await rv.json();
  check("review: 200", rv.ok, `${rv.status} in ${Date.now() - t0} ms`);
  if (rv.ok) {
    const comments = rvBody.review.comments as {
      file: string | null;
      line: number | null;
      quote: string | null;
    }[];
    const located = comments.filter((c) => c.file && c.line);
    check("review: has comments", comments.length > 0, `${comments.length} comments`);
    check("review: some are located", located.length > 0, `${located.length} located`);
    check(
      "review: quotes really occur on their lines",
      located.every((c) => !c.quote || lines[c.line! - 1].replace(/\s+/g, " ").includes(c.quote)),
    );
    check(
      "review: summary present",
      typeof rvBody.review.summary === "string" && rvBody.review.summary.length > 20,
    );
  }

  // 2. Assistant: streams a non-empty answer about the document.
  const ai = await call("POST", `/api/projects/${id}/ai`, {
    action: "ask",
    fileId: main.id,
    instruction: "In one sentence, what is this paper about?",
  });
  const answer = ai.ok ? await ai.text() : "";
  check(
    "assistant: streamed answer",
    ai.ok && answer.trim().length > 20,
    `${ai.status}, ${answer.length} chars`,
  );
} finally {
  await call("DELETE", `/api/projects/${id}`);
}

const failed = results.filter((r) => !r.ok).length;
console.log(`\n${results.length - failed}/${results.length} checks passed`);
process.exit(failed ? 1 : 0);
