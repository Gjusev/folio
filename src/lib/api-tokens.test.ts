import { describe, expect, it } from "vitest";
import { generateToken, hashToken, looksLikeToken, parseScopes } from "@/lib/api-tokens";

describe("api token core", () => {
  it("generates folio_ + 32 base62 chars with a matching 12-char prefix", () => {
    for (let i = 0; i < 50; i++) {
      const { token, prefix, hash } = generateToken();
      expect(token).toMatch(/^folio_[A-Za-z0-9]{32}$/);
      expect(token).toHaveLength(38);
      expect(looksLikeToken(token)).toBe(true);
      expect(prefix).toBe(token.slice(0, 12));
      expect(hash).toBe(hashToken(token)); // hash round-trips to authenticate
    }
  });

  it("parses scope CSVs, returning empty on any junk entry", () => {
    expect([...parseScopes("read,write")].sort()).toEqual(["read", "write"]);
    expect([...parseScopes("read, read ")].sort()).toEqual(["read"]);
    expect([...parseScopes("")]).toEqual([]);
    expect([...parseScopes("read,admin")]).toEqual([]); // all-or-nothing
    expect([...parseScopes("READ")]).toEqual([]);
  });

  it("hashes deterministically and differently per token", () => {
    const { token } = generateToken();
    const { token: other } = generateToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).not.toBe(hashToken(other));
    expect(hashToken(token)).toHaveLength(64); // sha-256 hex
  });
});
