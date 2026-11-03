import { describe, expect, it } from "vitest";
import { anthropicBody, deltaText, openAiBody, thinkFilter, type ChatMessage } from "@/lib/llm";
import { PRESETS } from "@/lib/llm-presets";
import { validateBaseUrl } from "@/lib/llm-profiles";
import { seal, unseal } from "@/lib/sealed";

process.env.LLM_CREDENTIALS_KEY = "a".repeat(64);

const endpoint = {
  id: "test",
  label: "Test",
  kind: "openai" as const,
  baseUrl: "https://api.example.com/v1",
  apiKey: "sk-x",
  model: "m1",
  extra: {},
};

describe("sealed (API keys at rest)", () => {
  it("round-trips and never stores the plaintext", () => {
    const s = seal("sk-secret-123");
    expect(s).not.toContain("sk-secret-123");
    expect(s.startsWith("v1:")).toBe(true);
    expect(unseal(s)).toBe("sk-secret-123");
    expect(unseal(null)).toBe("");
    expect(seal("")).toBe("");
  });

  it("rejects tampering and wrong secrets", () => {
    const s = seal("sk-secret-123");
    const tampered = s.slice(0, -4) + "AAAA";
    expect(() => unseal(tampered)).toThrow();
    process.env.LLM_CREDENTIALS_KEY = "b".repeat(64);
    expect(() => unseal(s)).toThrow(/LLM_CREDENTIALS_KEY/);
    process.env.LLM_CREDENTIALS_KEY = "a".repeat(64);
  });
});

describe("validateBaseUrl (Paperclip rules)", () => {
  it("accepts https anywhere and http on loopback only", () => {
    expect(validateBaseUrl("https://api.mistral.ai/v1").hostname).toBe("api.mistral.ai");
    expect(validateBaseUrl("http://localhost:11434/v1").hostname).toBe("localhost");
    expect(validateBaseUrl("http://127.0.0.1:8000/v1").hostname).toBe("127.0.0.1");
    expect(() => validateBaseUrl("http://evil.example.com/v1")).toThrow(/HTTPS/);
    expect(() => validateBaseUrl("https://u:p@x.com")).toThrow(/credenciales/);
    expect(() => validateBaseUrl("notaurl")).toThrow();
  });
});

describe("request builders", () => {
  const messages: ChatMessage[] = [
    { role: "system", content: "be terse" },
    { role: "user", content: "hi" },
    { role: "assistant", content: "hello" },
    { role: "user", content: "bye" },
  ];

  it("openAi: bearer auth, temperature, extra merged", () => {
    const e = { ...endpoint, extra: { provider: { data_collection: "deny" } } };
    const r = openAiBody(e, messages);
    expect(r.url).toBe("https://api.example.com/v1/chat/completions");
    expect(r.headers.authorization).toBe("Bearer sk-x");
    const body = JSON.parse(r.body);
    expect(body.model).toBe("m1");
    expect(body.stream).toBe(true);
    expect(body.provider).toEqual({ data_collection: "deny" });
  });

  it("anthropic: x-api-key, system hoisted, max_tokens, no temperature, alternation fixed", () => {
    const e = { ...endpoint, kind: "anthropic" as const, baseUrl: "https://api.anthropic.com" };
    const r = anthropicBody(e, [
      { role: "system", content: "one" },
      { role: "system", content: "two" },
      { role: "user", content: "a" },
      { role: "user", content: "b" },
      { role: "assistant", content: "c" },
    ]);
    expect(r.url).toBe("https://api.anthropic.com/v1/messages");
    expect(r.headers["x-api-key"]).toBe("sk-x");
    expect(r.headers["anthropic-version"]).toBe("2023-06-01");
    const body = JSON.parse(r.body);
    expect(body.system).toBe("one\n\ntwo");
    expect(body.max_tokens).toBe(8192);
    expect(body.temperature).toBeUndefined();
    expect(body.messages).toEqual([
      { role: "user", content: "a\n\nb" },
      { role: "assistant", content: "c" },
    ]);
  });

  it("deltaText parses both wire formats and surfaces provider errors", () => {
    expect(deltaText("openai", '{"choices":[{"delta":{"content":"hola"}}]}')).toBe("hola");
    expect(deltaText("openai", '{"choices":[{"delta":{}}]}')).toBeNull();
    expect(deltaText("anthropic", '{"type":"content_block_delta","delta":{"text":"welt"}}')).toBe(
      "welt",
    );
    expect(deltaText("anthropic", '{"type":"message_start"}')).toBeNull();
    expect(() => deltaText("anthropic", '{"type":"error","error":{"message":"bad key"}}')).toThrow(
      /bad key/,
    );
  });
});

describe("presets", () => {
  it("OpenRouter denies data collection by default; every preset has sane URLs", () => {
    const or = PRESETS.find((p) => p.id === "openrouter");
    expect(or?.extra).toEqual({ provider: { data_collection: "deny" } });
    for (const p of PRESETS) {
      if (!p.baseUrl) continue; // custom
      expect(() => validateBaseUrl(p.baseUrl)).not.toThrow();
      expect(p.models).toBeTruthy();
    }
  });
});

describe("thinkFilter re-export still behaves", () => {
  it("strips split tags", () => {
    const f = thinkFilter();
    expect(f("<thi")).toBe("");
    expect(f("nk>hidden</think>ok")).toBe("ok");
  });
});
