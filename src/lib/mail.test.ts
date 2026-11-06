import { describe, expect, it, vi } from "vitest";
import { fromAddress, mailUsable, transportOptions } from "./mail";

const base = {
  SMTP_URL: "",
  SMTP_HOST: "",
  SMTP_PORT: 465,
  SMTP_USER: "",
  SMTP_PASS: "",
  SMTP_FROM: "",
  APP_URL: "https://folio.example.org",
};

describe("transportOptions", () => {
  it("is null without SMTP_URL or SMTP_HOST", () => {
    expect(transportOptions(base)).toBeNull();
  });

  it("discrete form: implicit TLS on 465, STARTTLS elsewhere; credentials passed verbatim", () => {
    const user = "folio@example.org";
    const pass = "p#ss@w:rd/?";
    const tls = transportOptions({
      ...base,
      SMTP_HOST: "mx.example.org",
      SMTP_USER: user,
      SMTP_PASS: pass,
    });
    expect(tls).toMatchObject({
      host: "mx.example.org",
      port: 465,
      secure: true,
      auth: { user, pass },
    });
    expect(tls).not.toHaveProperty("url");
    const plain = transportOptions({ ...base, SMTP_HOST: "mx.example.org", SMTP_PORT: 587 });
    expect(plain).toMatchObject({ port: 587, secure: false, auth: undefined });
    expect(plain?.connectionTimeout).toBe(10_000);
  });

  it("SMTP_URL wins when both forms are set", () => {
    const o = transportOptions({
      ...base,
      SMTP_URL: "smtp://127.0.0.1:2525",
      SMTP_HOST: "mx.example.org",
    });
    expect(o).toEqual({
      url: "smtp://127.0.0.1:2525",
      connectionTimeout: 10_000,
      socketTimeout: 10_000,
    });
  });
});

describe("fromAddress", () => {
  it("SMTP_FROM, else the SMTP_USER mailbox, else no-reply at APP_URL's host", () => {
    expect(fromAddress({ ...base, SMTP_FROM: "Me <me@x.org>", SMTP_USER: "u@x.org" })).toBe(
      "Me <me@x.org>",
    );
    expect(fromAddress({ ...base, SMTP_USER: "folio@mokka.example" })).toBe(
      "Folio <folio@mokka.example>",
    );
    expect(fromAddress({ ...base, SMTP_USER: "apikey" })).toBe(
      "Folio <no-reply@folio.example.org>",
    );
    expect(fromAddress({ ...base, APP_URL: "" })).toBe("Folio <no-reply@localhost>");
  });
});

describe("mailUsable — pure rule over (SMTP config, NODE_ENV, APP_URL)", () => {
  const cfg = (nodeEnv: "development" | "production", APP_URL: string) => ({
    ...base,
    SMTP_HOST: "mx.example.org",
    NODE_ENV: nodeEnv,
    APP_URL,
  });

  it("production + APP_URL set: on", () => {
    expect(mailUsable(cfg("production", "https://folio.example.org"))).toBe(true);
  });

  it("production + APP_URL empty: off (links must never come from the Host header)", () => {
    expect(mailUsable(cfg("production", ""))).toBe(false);
  });

  it("development + APP_URL empty: on (localhost fallback)", () => {
    expect(mailUsable(cfg("development", ""))).toBe(true);
  });

  it("development + APP_URL set: on", () => {
    expect(mailUsable(cfg("development", "https://folio.example.org"))).toBe(true);
  });

  it("no SMTP configured: off in every environment", () => {
    expect(
      mailUsable({ ...base, NODE_ENV: "production", APP_URL: "https://folio.example.org" }),
    ).toBe(false);
  });
});

describe("SMTP_PORT parsing", () => {
  it('"" means the default 465, not 0 (Compose passes unset vars as empty)', async () => {
    vi.resetModules();
    const saved = process.env.SMTP_PORT;
    process.env.SMTP_PORT = "";
    try {
      const { env } = await import("@/lib/env");
      expect(env().SMTP_PORT).toBe(465);
    } finally {
      if (saved === undefined) delete process.env.SMTP_PORT;
      else process.env.SMTP_PORT = saved;
    }
  });

  it("an invalid port fails loudly, naming SMTP_PORT", async () => {
    vi.resetModules();
    process.env.SMTP_PORT = "not-a-port";
    try {
      const { env } = await import("@/lib/env");
      expect(() => env()).toThrow(/SMTP_PORT/);
    } finally {
      delete process.env.SMTP_PORT;
    }
  });
});
