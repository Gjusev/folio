import { isIP } from "node:net";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { anthropicBody, deltaText, openAiBody, thinkFilter, type ChatMessage } from "@/lib/llm";
import { PRESETS } from "@/lib/llm-presets";
import { isPrivateIp, validateBaseUrl } from "@/lib/llm-profiles";
import { seal, unseal } from "@/lib/sealed";

process.env.LLM_CREDENTIALS_KEY = "a".repeat(64);

// Deterministic DNS for the SSRF guard: no network in unit tests. IP literals
// resolve to themselves; hostnames come from `dnsTable`; anything else is a
// public address. See validateBaseUrl tests.
const dnsTable: Record<string, { address: string; family: number }[]> = {};
const publicIp = { address: "93.184.216.34", family: 4 };
vi.mock("node:dns/promises", () => ({
  lookup: (host: string) => {
    const bare = host.replace(/^\[|\]$/g, "");
    if (isIP(bare)) return Promise.resolve([{ address: bare, family: isIP(bare) }]);
    const recs = dnsTable[bare];
    if (recs === undefined) return Promise.resolve([publicIp]);
    // An explicit empty entry stands in for ENOTFOUND (the real lookup never
    // returns zero records).
    if (recs.length === 0) return Promise.reject(new Error("getaddrinfo ENOTFOUND"));
    return Promise.resolve(recs);
  },
}));

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

describe("isPrivateIp (SSRF ranges)", () => {
  it("flags private, loopback and link-local v4", () => {
    for (const ip of [
      "10.1.2.3",
      "172.16.0.1",
      "172.31.255.255",
      "192.168.0.1",
      "127.0.0.1",
      "169.254.169.254",
      "0.0.0.0",
    ])
      expect(isPrivateIp(ip)).toBe(true);
  });

  it("lets public v4 through", () => {
    for (const ip of ["1.1.1.1", "172.32.0.1", "172.15.255.255", "192.169.0.1", "93.184.216.34"])
      expect(isPrivateIp(ip)).toBe(false);
  });

  it("flags v6 loopback, unique-local, link-local and v4-mapped; passes public", () => {
    for (const ip of [
      "::1",
      "::",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "febf::",
      "::ffff:10.0.0.5",
    ])
      expect(isPrivateIp(ip)).toBe(true);
    for (const ip of ["2606:4700::1111", "2001:db8::1", "::ffff:1.1.1.1", "fec0::1"])
      expect(isPrivateIp(ip)).toBe(false);
  });
});

describe("validateBaseUrl (Paperclip + SSRF rules)", () => {
  beforeEach(() => {
    delete process.env.LLM_ALLOW_LOCAL;
    delete process.env.LLM_ALLOWED_LOCAL_PORTS;
    for (const k of Object.keys(dnsTable)) delete dnsTable[k];
  });

  it("accepts https to a public host", async () => {
    expect((await validateBaseUrl("https://api.mistral.ai/v1")).hostname).toBe("api.mistral.ai");
  });

  it("rejects private IP literals even over https", async () => {
    await expect(validateBaseUrl("https://10.0.0.5/v1")).rejects.toThrow(/interna/);
    await expect(validateBaseUrl("https://169.254.169.254/latest/meta-data")).rejects.toThrow(
      /interna/,
    );
    await expect(validateBaseUrl("http://[::1]:8000/v1")).rejects.toThrow(/interna/);
  });

  it("rejects hostnames whose records are all private (metadata via DNS)", async () => {
    dnsTable["attacker.example"] = [{ address: "10.0.0.9", family: 4 }];
    await expect(validateBaseUrl("https://attacker.example/v1")).rejects.toThrow(/interna/);
    dnsTable["v6.example"] = [{ address: "fd00::2", family: 6 }];
    await expect(validateBaseUrl("https://v6.example/v1")).rejects.toThrow(/interna/);
  });

  it("allows hostnames with at least one public record", async () => {
    dnsTable["mixed.example"] = [
      { address: "10.0.0.1", family: 4 },
      { address: "93.184.216.34", family: 4 },
    ];
    expect((await validateBaseUrl("https://mixed.example/v1")).hostname).toBe("mixed.example");
  });

  it("LLM_ALLOW_LOCAL: loopback allowed only on allowlisted ports", async () => {
    dnsTable["localhost"] = [{ address: "127.0.0.1", family: 4 }];
    process.env.LLM_ALLOW_LOCAL = "1";
    expect((await validateBaseUrl("http://localhost:11434/v1")).hostname).toBe("localhost");
    expect((await validateBaseUrl("http://127.0.0.1:11434/v1")).hostname).toBe("127.0.0.1");
    await expect(validateBaseUrl("http://127.0.0.1:8000/v1")).rejects.toThrow(/interna/);
    process.env.LLM_ALLOWED_LOCAL_PORTS = "8000, 11434";
    expect((await validateBaseUrl("http://127.0.0.1:8000/v1")).hostname).toBe("127.0.0.1");
    // No explicit port (default 80/443) is never on the allowlist.
    await expect(validateBaseUrl("http://localhost/v1")).rejects.toThrow(/interna/);
  });

  it("keeps the legacy protocol and credential rules", async () => {
    await expect(validateBaseUrl("http://evil.example.com/v1")).rejects.toThrow(/HTTPS/);
    await expect(validateBaseUrl("https://u:p@x.com")).rejects.toThrow(/credenciales/);
    await expect(validateBaseUrl("notaurl")).rejects.toThrow();
    dnsTable["nope.example"] = [];
    await expect(validateBaseUrl("https://nope.example/v1")).rejects.toThrow(/resolver/);
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
  it("OpenRouter denies data collection by default; every preset has sane URLs", async () => {
    const or = PRESETS.find((p) => p.id === "openrouter");
    expect(or?.extra).toEqual({ provider: { data_collection: "deny" } });
    // The Ollama preset is loopback: it needs the local-LLM opt-in to validate.
    dnsTable["localhost"] = [{ address: "127.0.0.1", family: 4 }];
    process.env.LLM_ALLOW_LOCAL = "1";
    try {
      for (const p of PRESETS) {
        if (!p.baseUrl) continue; // custom
        await expect(validateBaseUrl(p.baseUrl)).resolves.toBeInstanceOf(URL);
        expect(p.models).toBeTruthy();
      }
    } finally {
      delete process.env.LLM_ALLOW_LOCAL;
      delete dnsTable["localhost"];
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
