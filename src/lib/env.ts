import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  COMPILER_URL: z.url().default("http://localhost:3001"),
  COMPILER_TOKEN: z.string().min(16, "COMPILER_TOKEN must be at least 16 characters"),
  LLM_BASE_URL: z.union([z.literal(""), z.url()]).default(""),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default(""),
  // BYOK policy: the .env key is shared by EVERY user of the instance while
  // this is true (the single-user default). Set it to false on a multi-user
  // instance to require each user to add their own provider in Settings.
  LLM_ENV_SHARED: z.stringbool().or(z.boolean()).default(true),
  OPENALEX_MAILTO: z.union([z.literal(""), z.email()]).default(""),
  OPENALEX_API_KEY: z.string().default(""),
  // Optional LanguageTool server (e.g. http://languagetool:8010). Empty = grammar checking off.
  LANGUAGETOOL_URL: z.union([z.literal(""), z.url()]).default(""),
  // 1/true (default) keeps self-registration open for dev; production operators
  // set 0 to close it. Accepts booleans and the usual string spellings.
  ALLOW_REGISTRATION: z.stringbool().or(z.boolean()).default(true),
  // Public origin (https://folio.example.org). Absolute links in e-mails are
  // built ONLY from this, never from the request's Host header.
  APP_URL: z.union([z.literal(""), z.url()]).default(""),
  // Optional SMTP, as one URL (smtps://user:pass@smtp.example.org:465) or as
  // discrete SMTP_HOST/PORT/USER/PASS (no URL-encoding of special characters).
  // SMTP_URL wins when both are set. Neither = no e-mail: no password reset by
  // mail, no invitation e-mails.
  SMTP_URL: z.union([z.literal(""), z.url()]).default(""),
  SMTP_HOST: z.string().default(""),
  // "" (compose passes unset vars as empty) means the default, not port 0.
  SMTP_PORT: z.preprocess(
    (v) => (v === "" ? undefined : v),
    z.coerce.number().int().min(1).max(65_535).default(465),
  ),
  SMTP_USER: z.string().default(""),
  SMTP_PASS: z.string().default(""),
  // Sender; empty = SMTP_USER when it is an address, else "Folio <no-reply@APP_URL's host>".
  SMTP_FROM: z.string().default(""),
  // Multiplies every rate-limit ceiling (1 = production default, unchanged).
  // For test stacks that hammer one instance from one IP, e.g. the e2e suite
  // needing more than 10 log-ins per 15 minutes. Not a security knob: raising
  // it lowers your own protection.
  RATE_LIMIT_MULTIPLIER: z.coerce.number().int().min(1).max(10_000).default(1),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

/** Validated environment. Lazy so `next build` works without runtime secrets. */
export function env(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`);
      throw new Error(`Invalid environment configuration:\n  ${issues.join("\n  ")}`);
    }
    cached = parsed.data;
  }
  return cached;
}
