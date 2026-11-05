import { createServer, type Server } from "node:http";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST as agentRoute } from "@/app/api/projects/[id]/agent/route";
import { GET as aiState, POST as aiRoute } from "@/app/api/projects/[id]/ai/route";
import { GET as disclosureRoute } from "@/app/api/projects/[id]/ai/disclosure/route";
import { POST as ragRoute } from "@/app/api/projects/[id]/rag/route";
import { POST as reviewRoute } from "@/app/api/projects/[id]/review/route";
import { GET as getProject, PATCH as patchProject } from "@/app/api/projects/[id]/route";
import { listAiUsage } from "@/lib/ai-usage";
import { closeDb, db, schema } from "@/lib/db";
import { createProfile } from "@/lib/llm-profiles";
import { addMember, createProject, listFiles } from "@/lib/projects";
import { resetRateLimits } from "@/lib/rate-limit";
import { ctx, request, signUp } from "../../../test/helpers";

const LLM_PORT = 39_141;
vi.hoisted(() => {
  process.env.LLM_CREDENTIALS_KEY = "t".repeat(64);
  // No shared .env endpoint: every call runs on the caller's own key (BYOK).
  process.env.LLM_BASE_URL = "";
  process.env.LLM_MODEL = "";
  // The editor's own provider is the fake model below, on loopback.
  process.env.LLM_ALLOW_LOCAL = "1";
  process.env.LLM_ALLOWED_LOCAL_PORTS = "39141";
});

let llmRequests: { auth?: string }[] = [];
const servers: Server[] = [];

beforeAll(async () => {
  const s = createServer((req, res) => {
    llmRequests.push({ auth: req.headers.authorization });
    req.resume();
    req.on("end", () => {
      res.writeHead(200, { "content-type": "text/event-stream" });
      for (const piece of ["Improved ", "text."])
        res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: piece } }] })}\n\n`);
      res.end("data: [DONE]\n\n");
    });
  });
  servers.push(s);
  await new Promise<void>((r) => s.listen(LLM_PORT, "127.0.0.1", () => r()));
});

afterAll(async () => {
  await Promise.all(servers.map((s) => new Promise((r) => s.close(r))));
  await closeDb();
});

beforeEach(() => {
  resetRateLimits();
  llmRequests = [];
});

async function userIdOf(email: string) {
  const [row] = await db()
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(eq(schema.users.email, email));
  return row.id;
}

/** An owner's project shared with an editor who brings their own key. */
async function setup() {
  const owner = await signUp();
  const editor = await signUp();
  const project = await createProject(await userIdOf(owner.email), "Policy paper", [
    {
      path: "main.tex",
      content: "\\documentclass{article}\n\\begin{document}\nHello.\n\\end{document}\n",
    },
  ]);
  await addMember(project.id, editor.email, "editor");
  await createProfile(await userIdOf(editor.email), {
    label: "Mine",
    kind: "openai",
    baseUrl: `http://127.0.0.1:${LLM_PORT}/v1`,
    apiKey: "sk-editor",
    models: "editor-model",
  });
  const main = (await listFiles(project.id)).find((f) => f.path === "main.tex")!;
  return { owner: owner.cookie, editor: editor.cookie, id: project.id, fileId: main.id };
}

const patch = (cookie: string, id: string, body: unknown) =>
  patchProject(request("PATCH", `/api/projects/${id}`, { cookie, body }), ctx({ id }));

describe("project AI policy", () => {
  it("off: every AI route refuses an editor's own key, and nothing reaches the provider", async () => {
    const { owner, editor, id, fileId } = await setup();
    expect((await patch(owner, id, { aiPolicy: "off" })).status).toBe(200);

    const post = (path: string, body: unknown) =>
      request("POST", `/api/projects/${id}/${path}`, { cookie: editor, body });
    const responses = [
      await aiRoute(post("ai", { action: "ask", fileId, instruction: "summarise" }), ctx({ id })),
      await agentRoute(
        post("agent", { instruction: "a related work section on attention", fileId }),
        ctx({ id }),
      ),
      await reviewRoute(
        post("review", { lang: "en", aspects: ["clarity"], scope: "all" }),
        ctx({ id }),
      ),
      await ragRoute(post("rag", {}), ctx({ id })),
    ];
    for (const res of responses) {
      expect(res.status).toBe(403);
      expect((await res.json()).error).toMatch(/desactivada en este proyecto/);
    }
    expect(llmRequests).toHaveLength(0);

    const state = await (
      await aiState(request("GET", `/api/projects/${id}/ai`, { cookie: editor }), ctx({ id }))
    ).json();
    expect(state).toMatchObject({ enabled: false, policy: "off", blocked: "off" });
  });

  it("only the owner changes it; editors keep their other edits", async () => {
    const { owner, editor, id } = await setup();
    const denied = await patch(editor, id, { aiPolicy: "off" });
    expect(denied.status).toBe(403);
    expect((await denied.json()).error).toBe("Solo el propietario puede cambiar la política de IA");
    // A mixed request is refused before anything is written.
    expect((await patch(editor, id, { name: "Sneaky", aiPolicy: "any" })).status).toBe(403);
    expect((await patch(editor, id, { name: "Renamed" })).status).toBe(200);
    expect((await patch(owner, id, { aiPolicy: "bogus" })).status).toBe(400);
    expect((await patch(owner, id, { aiPolicy: "local" })).status).toBe(200);

    const { project } = await (
      await getProject(request("GET", `/api/projects/${id}`, { cookie: editor }), ctx({ id }))
    ).json();
    expect(project).toMatchObject({ name: "Renamed", aiPolicy: "local" });
  });
});

describe("AI-use ledger and disclosure", () => {
  it("records a successful assistant call with the caller's model; the disclosure follows", async () => {
    const { editor, id, fileId } = await setup();
    const disclosure = async () =>
      (
        await disclosureRoute(
          request("GET", `/api/projects/${id}/ai/disclosure?lang=en`, { cookie: editor }),
          ctx({ id }),
        )
      ).json();
    expect(await disclosure()).toEqual({ latex: null });

    const state = await (
      await aiState(request("GET", `/api/projects/${id}/ai`, { cookie: editor }), ctx({ id }))
    ).json();
    expect(state).toMatchObject({ enabled: true, policy: "any" });
    expect(state.blocked).toBeUndefined();

    const res = await aiRoute(
      request("POST", `/api/projects/${id}/ai`, {
        cookie: editor,
        body: { action: "improve", fileId, selection: "Hello." },
      }),
      ctx({ id }),
    );
    // NDJSON frames now; the rejoined text answer must match the old shape.
    const streamed = (await res.text())
      .trim()
      .split("\n")
      .map((l) => JSON.parse(l) as { t: string; s: string })
      .filter((e) => e.t === "text")
      .map((e) => e.s)
      .join("");
    expect(streamed).toBe("Improved text.");
    expect(llmRequests[0].auth).toBe("Bearer sk-editor");
    // The ledger is written right after the stream closes.
    await vi.waitFor(async () => expect(await listAiUsage(id)).toHaveLength(1));
    expect(await listAiUsage(id)).toMatchObject([{ action: "improve", model: "editor-model" }]);

    const d = await disclosure();
    expect(d).toMatchObject({
      models: ["editor-model"],
      purposes: ["improve language and readability"],
      count: 1,
    });
    expect(d.latex).toContain("used editor-model through Folio in order to improve language");
  });
});
