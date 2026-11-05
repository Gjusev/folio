import { randomUUID } from "node:crypto";
import { NextRequest } from "next/server";
import { POST as register } from "@/app/api/auth/register/route";

type Init = { body?: unknown; cookie?: string; headers?: Record<string, string> };

export function request(method: string, path: string, init: Init = {}) {
  const headers: Record<string, string> = { ...init.headers };
  if (init.body !== undefined) headers["content-type"] ??= "application/json";
  if (init.cookie) headers.cookie = init.cookie;
  return new NextRequest(new URL(path, "http://localhost:3000"), {
    method,
    headers,
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
}

export const ctx = <P extends Record<string, string>>(params: P) => ({
  params: Promise.resolve(params),
});

/** Registers a fresh user and returns its session cookie header. */
export async function signUp(): Promise<{ cookie: string; email: string }> {
  const email = `user-${randomUUID()}@example.org`;
  const res = await register(
    request("POST", "/api/auth/register", {
      body: { email, name: "Test User", password: "correct horse battery" },
    }),
    undefined,
  );
  if (res.status !== 201) throw new Error(`sign-up failed: ${res.status} ${await res.text()}`);
  const setCookie = res.headers.get("set-cookie") ?? "";
  return { cookie: setCookie.split(";")[0], email };
}

/** A minimal valid PDF (correct xref offsets) with `lines` of text on each of
 *  `pages` pages. ASCII-only lines, so string offsets equal byte offsets. The
 *  page is tall enough that every line stays inside the MediaBox (pdf.js drops
 *  text placed outside it). */
export function tinyPdf(lines: string[], pages = 1): Uint8Array {
  const esc = (s: string) => s.replace(/([()\\])/g, "\\$1");
  const top = 14 * (lines.length + 2);
  const stream = `BT /F1 12 Tf 72 ${top} Td 14 TL\n${lines.map((l) => `(${esc(l)}) Tj T*`).join("\n")}\nET`;
  const objects: string[] = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "", // pages object, filled once the kids are known
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  const kids: number[] = [];
  for (let p = 0; p < pages; p++) {
    kids.push(objects.length + 1);
    objects.push(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 ${top + 28}] /Resources << /Font << /F1 3 0 R >> >> /Contents ${objects.length + 2} 0 R >>`,
    );
    objects.push(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
  }
  objects[1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${pages} >>`;
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((body, i) => {
    offsets.push(pdf.length);
    pdf += `${i + 1} 0 obj\n${body}\nendobj\n`;
  });
  const xref = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) pdf += `${String(off).padStart(10, "0")} 00000 n \n`;
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(pdf);
}
