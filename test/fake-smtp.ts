import { createServer, type Socket } from "node:net";

// A fake SMTP server for the mail tests (vitest and e2e). SMTP is a line
// protocol: 220 greeting; EHLO → 250; MAIL/RCPT → 250; DATA → 354, collect
// until "\r\n.\r\n" → 250; QUIT → 221. No TLS, no AUTH.

export type CapturedMail = { rcpt: string[]; data: string };

export async function startFakeSmtp(port: number, host = "127.0.0.1") {
  const mails: CapturedMail[] = [];
  const sockets = new Set<Socket>();
  let connections = 0;

  const server = createServer((sock) => {
    connections++;
    sockets.add(sock);
    sock.on("close", () => sockets.delete(sock));
    sock.on("error", () => {});
    sock.setEncoding("utf8");
    let buf = "";
    let inData = false;
    let rcpt: string[] = [];
    sock.write("220 fake ESMTP\r\n");
    sock.on("data", (chunk: string) => {
      buf += chunk;
      for (;;) {
        if (inData) {
          const end = buf.indexOf("\r\n.\r\n");
          if (end < 0) return;
          mails.push({ rcpt, data: buf.slice(0, end) });
          buf = buf.slice(end + 5);
          inData = false;
          rcpt = [];
          sock.write("250 OK queued\r\n");
          continue;
        }
        const nl = buf.indexOf("\r\n");
        if (nl < 0) return;
        const line = buf.slice(0, nl);
        buf = buf.slice(nl + 2);
        const cmd = line.slice(0, 4).toUpperCase();
        if (cmd === "EHLO" || cmd === "HELO") sock.write("250-fake\r\n250 OK\r\n");
        else if (cmd === "RCPT") {
          rcpt.push(line);
          sock.write("250 OK\r\n");
        } else if (cmd === "DATA") {
          inData = true;
          sock.write("354 go ahead\r\n");
        } else if (cmd === "QUIT") sock.end("221 bye\r\n");
        else sock.write("250 OK\r\n"); // MAIL, RSET, NOOP
      }
    });
  });
  await new Promise<void>((r) => server.listen(port, host, () => r()));

  return {
    mails,
    connections: () => connections,
    reset() {
      mails.length = 0;
      connections = 0;
    },
    /** Sends are fire-and-forget on the server: poll until `n` mails arrived. */
    async waitFor(n: number, timeoutMs = 5000) {
      for (let t = 0; t < timeoutMs && mails.length < n; t += 50) {
        await new Promise((r) => setTimeout(r, 50));
      }
      return mails;
    },
    async close() {
      for (const s of sockets) s.destroy();
      await new Promise((r) => server.close(r));
    },
  };
}

/** Quoted-printable (soft breaks and =XX bytes) back to UTF-8. */
function qp(s: string): string {
  const bin = s.replace(/=\r\n/g, "");
  const bytes: number[] = [];
  for (let i = 0; i < bin.length; i++) {
    const hex = bin.slice(i + 1, i + 3);
    if (bin[i] === "=" && /^[0-9A-F]{2}$/.test(hex)) {
      bytes.push(parseInt(hex, 16));
      i += 2;
    } else bytes.push(bin.charCodeAt(i));
  }
  return Buffer.from(bytes).toString("utf8");
}

/** Decoded body of the text/plain or text/html part of a raw message ("" if absent). */
export function mailPart(raw: string, type: "text/plain" | "text/html"): string {
  const start = raw.indexOf(`Content-Type: ${type}`);
  if (start < 0) return "";
  const headerEnd = raw.indexOf("\r\n\r\n", start);
  const end = raw.indexOf("\r\n--", headerEnd);
  const body = raw.slice(headerEnd + 4, end < 0 ? undefined : end);
  const headers = raw.slice(start, headerEnd);
  return /base64/i.test(headers) ? Buffer.from(body, "base64").toString("utf8") : qp(body);
}
