import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

// API keys are sealed at rest with AES-256-GCM. The key material is derived
// (HKDF) from LLM_CREDENTIALS_KEY so the env secret never appears in the DB.
// Rotating the secret invalidates stored keys: they must be re-entered.

const VERSION = "v1";

function deriveKey(): Buffer {
  const secret = process.env.LLM_CREDENTIALS_KEY;
  if (!secret || secret.length < 16)
    throw new Error(
      "Falta LLM_CREDENTIALS_KEY (genera uno: node -e \"console.log(require('crypto').randomBytes(32).toString('hex'))\")",
    );
  return Buffer.from(hkdfSync("sha256", secret, "folio-llm-credentials", "api-keys", 32));
}

/** Returns "v1:iv:tag:ciphertext" (all base64url); empty input stays empty. */
export function seal(plain: string): string {
  if (!plain) return "";
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveKey(), iv);
  const ct = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [VERSION, iv, ct, tag].map((b) => b.toString("base64url")).join(":");
}

/** Throws on tampering, wrong secret or wrong format. */
export function unseal(sealed: string | null | undefined): string {
  if (!sealed) return "";
  const parts = sealed.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) throw new Error("Clave ilegible");
  const [iv, ct, tag] = parts.slice(1).map((p) => Buffer.from(p, "base64url"));
  try {
    const decipher = createDecipheriv("aes-256-gcm", deriveKey(), iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ct), decipher.final()]).toString("utf8");
  } catch {
    // Covers wrong secret, tampering and length-corrupted blobs alike.
    throw new Error(
      "No se pudo descifrar la clave (¿cambiaste LLM_CREDENTIALS_KEY? reintrodúcela)",
    );
  }
}

export function sealConfigured(): boolean {
  const s = process.env.LLM_CREDENTIALS_KEY;
  return Boolean(s && s.length >= 16);
}
