import { describe, expect, it } from "vitest";
import { DICTS, format } from "./dictionaries";

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
