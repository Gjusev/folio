import { describe, expect, it } from "vitest";
import { DICTS, format, negotiateLang } from "./dictionaries";

describe("negotiateLang", () => {
  it("picks the highest-q supported language", () => {
    expect(negotiateLang("de-DE,de;q=0.9,en;q=0.8")).toBe("de");
    expect(negotiateLang("fr;q=0.9,es-MX;q=0.8,en;q=0.5")).toBe("es");
    expect(negotiateLang("en-GB,en;q=0.9")).toBe("en");
  });

  it("honours q-values over order", () => {
    expect(negotiateLang("es;q=0.4, de;q=0.9")).toBe("de");
  });

  it("ignores q=0 and unsupported languages, falling back to English", () => {
    expect(negotiateLang("es;q=0, fr")).toBe("en");
    expect(negotiateLang("ja,zh;q=0.9")).toBe("en");
    expect(negotiateLang("")).toBe("en");
    expect(negotiateLang(null)).toBe("en");
    expect(negotiateLang(undefined)).toBe("en");
  });

  it("matches the primary subtag case-insensitively and tolerates junk", () => {
    expect(negotiateLang("ES-ar")).toBe("es");
    expect(negotiateLang(";;q=x, de;q=oops")).toBe("de");
    expect(negotiateLang("*")).toBe("en");
  });
});

describe("format", () => {
  it("substitutes plain vars", () => {
    expect(format(DICTS.es, "projects.count", { n: 3 })).toBe("3 documentos");
  });

  it("picks the singular alternative when the var is 1", () => {
    expect(format(DICTS.de, "projects.count", { n: 1 })).toBe("1 Dokument");
    expect(format(DICTS.es, "projects.count", { n: 1 })).toBe("1 documento");
    expect(format(DICTS.en, "projects.count", { n: 1 })).toBe("1 document");
  });

  it("inflects a phrase, not only the noun", () => {
    expect(format(DICTS.es, "papers.health.undefined", { n: 1 })).toBe("1 citada y no definida");
    expect(format(DICTS.es, "papers.health.undefined", { n: 4 })).toBe("4 citadas y no definidas");
  });

  it("leaves unknown vars visible instead of dropping them", () => {
    expect(format(DICTS.es, "projects.count", {})).toContain("{n");
  });

  it("every countable string pluralises in the three languages", () => {
    for (const dict of Object.values(DICTS)) {
      expect(format(dict, "lib.summary", { n: 1, cited: 1, unused: 0 })).not.toMatch(
        /\b1\s+\S+s\b|\b1\s+Einträge\b/,
      );
    }
  });
});
