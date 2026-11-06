import { describe, expect, it } from "vitest";
import { LANGS } from "@/lib/i18n/dictionaries";
import { escapeHtml, inviteEmail, resetEmail } from "./mail-templates";

const LINK = "https://folio.example.org/reset?token=abc_DEF-123";
const EVIL = '<script>alert("x")</script> & <img src=x onerror=1>';

describe("mail templates", () => {
  it("escapes every HTML-special character", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;",
    );
  });

  it.each(LANGS)("reset (%s): link verbatim in text and html, minutes shown", (lang) => {
    const m = resetEmail(lang, LINK, 30);
    expect(m.subject).toBeTruthy();
    expect(m.text).toContain(LINK);
    expect(m.html).toContain(`href="${LINK}"`);
    expect(m.text).toContain("30");
  });

  it.each(LANGS)("invite (%s): user input never reaches the html raw", (lang) => {
    const link = "https://folio.example.org/projects/0b7c";
    const m = inviteEmail(lang, { inviterName: EVIL, projectName: EVIL, role: "editor", link });
    expect(m.html).not.toContain("<script>");
    expect(m.html).not.toContain("<img");
    expect(m.html).toContain("&lt;script&gt;");
    expect(m.html).toContain(`href="${link}"`);
    expect(m.text).toContain(link);
    // The text part is plain text: the names appear as typed.
    expect(m.text).toContain(EVIL);
  });

  it("the three languages differ", () => {
    const subjects = new Set(LANGS.map((l) => resetEmail(l, LINK, 30).subject));
    expect(subjects.size).toBe(3);
    const roles = LANGS.map(
      (l) =>
        inviteEmail(l, { inviterName: "A", projectName: "P", role: "viewer", link: LINK }).text,
    );
    expect(new Set(roles).size).toBe(3);
  });
});
