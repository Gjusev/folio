import { afterEach, describe, expect, it, vi } from "vitest";
import { deltaText, streamChat, streamText } from "@/lib/llm";

const endpoint = {
  id: "test",
  label: "Test",
  kind: "openai" as const,
  baseUrl: "https://api.example.com/v1",
  apiKey: "",
  model: "m1",
  extra: {},
};

/** A 200 SSE Response carrying the given payloads. */
function sse(...payloads: string[]) {
  const body = new ReadableStream<Uint8Array>({
    start(c) {
      c.enqueue(new TextEncoder().encode(payloads.map((p) => `data: ${p}\n\n`).join("")));
      c.close();
    },
  });
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const collect = async <T>(gen: AsyncGenerator<T>) => {
  const out: T[] = [];
  for await (const x of gen) out.push(x);
  return out;
};

afterEach(() => vi.unstubAllGlobals());

describe("deltaText (reasoning deltas, both protocols)", () => {
  it("openai: content → text", () => {
    expect(deltaText("openai", '{"choices":[{"delta":{"content":"hola"}}]}')).toEqual({
      kind: "text",
      text: "hola",
    });
  });

  it("openai: reasoning_content (DeepSeek-R1 style) → thinking", () => {
    expect(deltaText("openai", '{"choices":[{"delta":{"reasoning_content":"pienso"}}]}')).toEqual({
      kind: "thinking",
      text: "pienso",
    });
  });

  it("openai: reasoning (gateways) → thinking", () => {
    expect(deltaText("openai", '{"choices":[{"delta":{"reasoning":"hmm"}}]}')).toEqual({
      kind: "thinking",
      text: "hmm",
    });
  });

  it("openai: empty deltas → null", () => {
    expect(deltaText("openai", '{"choices":[{"delta":{}}]}')).toBeNull();
    expect(deltaText("openai", '{"choices":[]}')).toBeNull();
  });

  it("anthropic: text_delta → text, bare delta.text still works", () => {
    expect(
      deltaText(
        "anthropic",
        '{"type":"content_block_delta","delta":{"type":"text_delta","text":"welt"}}',
      ),
    ).toEqual({ kind: "text", text: "welt" });
    expect(deltaText("anthropic", '{"type":"content_block_delta","delta":{"text":"alt"}}')).toEqual(
      { kind: "text", text: "alt" },
    );
  });

  it("anthropic: thinking_delta → thinking", () => {
    expect(
      deltaText(
        "anthropic",
        '{"type":"content_block_delta","delta":{"type":"thinking_delta","thinking":"ich denke"}}',
      ),
    ).toEqual({ kind: "thinking", text: "ich denke" });
  });

  it("anthropic: non-delta events → null", () => {
    expect(deltaText("anthropic", '{"type":"message_start"}')).toBeNull();
    expect(
      deltaText("anthropic", '{"type":"content_block_start","content_block":{"type":"thinking"}}'),
    ).toBeNull();
  });

  it("surfaces provider errors on both protocols", () => {
    expect(() => deltaText("openai", '{"error":{"message":"bad key"}}')).toThrow(/bad key/);
    expect(() => deltaText("anthropic", '{"type":"error","error":{"message":"nope"}}')).toThrow(
      /nope/,
    );
  });
});

describe("streamChat / streamText", () => {
  it("separates thinking from text (openai-compat) and strips inline <think> tags", async () => {
    vi.stubGlobal("fetch", async () =>
      sse(
        JSON.stringify({ choices: [{ delta: { reasoning_content: "let me " } }] }),
        JSON.stringify({ choices: [{ delta: { reasoning_content: "think" } }] }),
        JSON.stringify({ choices: [{ delta: { content: "Hola " } }] }),
        JSON.stringify({ choices: [{ delta: { content: "<think>x</think>mundo" } }] }),
        "[DONE]",
      ),
    );
    expect(
      await collect(streamChat([{ role: "user", content: "hi" }], undefined, endpoint)),
    ).toEqual([
      { kind: "thinking", text: "let me " },
      { kind: "thinking", text: "think" },
      { kind: "text", text: "Hola " },
      { kind: "text", text: "mundo" },
    ]);
    expect(
      await collect(streamText([{ role: "user", content: "hi" }], undefined, endpoint)),
    ).toEqual(["Hola ", "mundo"]);
  });

  it("anthropic: thinking_delta then text_delta", async () => {
    vi.stubGlobal("fetch", async () =>
      sse(
        JSON.stringify({
          type: "content_block_delta",
          delta: { type: "thinking_delta", thinking: "erst denken" },
        }),
        JSON.stringify({
          type: "content_block_delta",
          delta: { type: "text_delta", text: "dann schreiben" },
        }),
        "[DONE]",
      ),
    );
    expect(
      await collect(
        streamChat([{ role: "user", content: "hi" }], undefined, {
          ...endpoint,
          kind: "anthropic",
        }),
      ),
    ).toEqual([
      { kind: "thinking", text: "erst denken" },
      { kind: "text", text: "dann schreiben" },
    ]);
  });

  it("reasoning-only stream yields thinking chunks and no text", async () => {
    vi.stubGlobal("fetch", async () =>
      sse(JSON.stringify({ choices: [{ delta: { reasoning: "only thoughts" } }] }), "[DONE]"),
    );
    expect(
      await collect(streamChat([{ role: "user", content: "hi" }], undefined, endpoint)),
    ).toEqual([{ kind: "thinking", text: "only thoughts" }]);
    expect(
      await collect(streamText([{ role: "user", content: "hi" }], undefined, endpoint)),
    ).toEqual([]);
  });
});
