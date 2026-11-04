// Self-hosted password reset — no email infrastructure assumed. Run on the
// server that hosts the database, as the admin:
//
//   pnpm reset-password someone@example.org
//   # or non-interactive:  pnpm reset-password someone@example.org -- new-password
//
// Self-contained on purpose: a rescue script must run even when the app tree
// is broken, so it re-implements the 10-line scrypt hash instead of importing
// src/lib/auth/password.ts. The format string is the contract (verifyPassword
// reads the parameters back from the hash, so old hashes stay valid).
import { randomBytes, scrypt } from "node:crypto";
import { Pool } from "pg";

const N = 2 ** 17;
const R = 8;
const P = 1;
const KEYLEN = 64;

function hashPassword(password: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(
      password.normalize("NFKC"),
      salt,
      KEYLEN,
      { N, r: R, p: P, maxmem: 512 * 1024 * 1024 },
      (err, key) =>
        err
          ? reject(err)
          : resolve(["scrypt", N, R, P, salt.toString("base64"), key.toString("base64")].join("$")),
    );
  });
}

const [email, ...rest] = process.argv.slice(2);
if (!email || !email.includes("@")) {
  console.error("uso: pnpm reset-password <email> [-- <nueva-contraseña>]");
  process.exit(1);
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL no está definida (cópiala de .env)");
  process.exit(1);
}

let password: string;
if (rest[0] === "--" && rest[1]) {
  password = rest[1];
} else {
  const { createInterface } = await import("node:readline/promises");
  password = await createInterface({ input: process.stdin, output: process.stdout }).question(
    "Nueva contraseña: ",
  );
}

if (password.length < 8) {
  console.error("La contraseña debe tener al menos 8 caracteres");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
try {
  const hash = await hashPassword(password);
  const r = await pool.query(
    "UPDATE users SET password_hash = $1 WHERE email = $2 RETURNING id, email",
    [hash, email.toLowerCase()],
  );
  if (r.rowCount === 0) {
    console.error(`No existe ninguna cuenta con el email ${email}`);
    process.exit(1);
  }
  console.log(`Contraseña actualizada para ${r.rows[0].email}`);
  console.log(
    "(Las sesiones activas no se revocan; reinicia el contenedor web si quieres cerrarlas)",
  );
} finally {
  await pool.end();
}
