import { afterAll, describe, expect, it, vi } from "vitest";
import { closeDb } from "@/lib/db";
import { asPolicy, isLocalEndpoint, resolveProjectEndpoint } from "@/lib/ai-policy";

// The server-wide endpoint is the only provider in this worker; its host name
// decides "local" through the mocked DNS below.
vi.hoisted(() => {
  process.env.LLM_CREDENTIALS_KEY = "t".repeat(64);
  process.env.LLM_BASE_URL = "https://api.mistral.ai/v1";
  process.env.LLM_MODEL = "mistral-small-latest";
  process.env.LLM_ENV_SHARED = "true";
});

vi.mock("node:dns/promises", () => ({
  lookup: (host: string) => {
    const table: Record<string, string[]> = {
      "api.mistral.ai": ["104.18.1.1"],
      localhost: ["127.0.0.1"],
      "ollama.internal": ["10.0.0.7"],
      "host.docker.internal": ["192.168.65.254"],
      "mixed.example": ["10.0.0.8", "93.184.216.34"],
    };
    const ips = table[host];
    return ips
      ? Promise.resolve(ips.map((address) => ({ address, family: 4 })))
      : Promise.reject(new Error("ENOTFOUND"));
  },
}));

afterAll(async () => {
  await closeDb();
});

describe("asPolicy", () => {
  it("accepts the three policies and falls back to any", () => {
    expect(asPolicy("off")).toBe("off");
    expect(asPolicy("local")).toBe("local");
    expect(asPolicy("any")).toBe("any");
    expect(asPolicy("whatever")).toBe("any");
    expect(asPolicy(null)).toBe("any");
  });
});

describe("isLocalEndpoint", () => {
  it("local only when every address is loopback or private", async () => {
    expect(await isLocalEndpoint("http://localhost:11434/v1")).toBe(true);
    expect(await isLocalEndpoint("http://ollama.internal:11434/v1")).toBe(true);
    expect(await isLocalEndpoint("http://host.docker.internal:11434/v1")).toBe(true);
    expect(await isLocalEndpoint("https://api.mistral.ai/v1")).toBe(false);
    // One public record is enough to leave the network: not local.
    expect(await isLocalEndpoint("https://mixed.example/v1")).toBe(false);
  });

  it("fails closed on DNS errors and junk URLs", async () => {
    expect(await isLocalEndpoint("https://nowhere.invalid/v1")).toBe(false);
    expect(await isLocalEndpoint("not a url")).toBe(false);
  });
});

describe("resolveProjectEndpoint", () => {
  const user = "00000000-0000-4000-8000-000000000000";

  it("any: the user's own routing, untouched", async () => {
    const e = await resolveProjectEndpoint(user, { aiPolicy: "any" }, "draft");
    expect(e?.baseUrl).toBe("https://api.mistral.ai/v1");
  });

  it("off: 403 for everyone, before any provider is looked up", async () => {
    await expect(resolveProjectEndpoint(user, { aiPolicy: "off" }, "draft")).rejects.toMatchObject({
      status: 403,
    });
  });

  it("local: a remote endpoint is refused with 403", async () => {
    await expect(
      resolveProjectEndpoint(user, { aiPolicy: "local" }, "draft"),
    ).rejects.toMatchObject({ status: 403 });
  });
});
