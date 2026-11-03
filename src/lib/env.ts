import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.url(),
  COMPILER_URL: z.url().default("http://localhost:3001"),
  COMPILER_TOKEN: z.string().min(16, "COMPILER_TOKEN must be at least 16 characters"),
  LLM_BASE_URL: z.union([z.literal(""), z.url()]).default(""),
  LLM_API_KEY: z.string().default(""),
  LLM_MODEL: z.string().default(""),
  OPENALEX_MAILTO: z.union([z.literal(""), z.email()]).default(""),
  OPENALEX_API_KEY: z.string().default(""),
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
