import { describe, expect, it } from "vitest";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { validateFilePath } from "@/lib/paths";

describe("validateFilePath", () => {
  it.each(["main.tex", "refs.bib", "sections/intro.tex", "style/my-style.sty", "data_1.csv"])(
    "accepts %s",
    (p) => expect(validateFilePath(p)).toBeNull(),
  );
  it.each([
    "",
    "../x.tex",
    "a/../b.tex",
    "/etc/passwd.tex",
    ".latexmkrc",
    "latexmkrc",
    "run.sh",
    "a\\b.tex",
    "dir.tex/file",
    "a//b.tex",
    "x".repeat(201) + ".tex",
  ])("rejects %j", (p) => expect(validateFilePath(p)).not.toBeNull());
});

describe("password hashing", () => {
  it("verifies the right password only", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash.startsWith("scrypt$131072$8$1$")).toBe(true);
    expect(await verifyPassword("correct horse battery", hash)).toBe(true);
    expect(await verifyPassword("wrong", hash)).toBe(false);
    expect(await verifyPassword("x", "garbage")).toBe(false);
  });
});
