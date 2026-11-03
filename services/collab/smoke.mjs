// Two-client smoke test for the collab relay, no test framework involved:
//   node smoke.mjs
// Boots the relay on an ephemeral port, connects two browser-style WebSocket
// clients (Node's global WebSocket) and checks the whole wire protocol:
// state on join, first/joiner seeding, update broadcast, awareness relay and
// the "bye" cursor drop. Exit code 0 = all green.
import { spawn } from "node:child_process";
import { createHmac } from "node:crypto";
import { fileURLToPath } from "node:url";

const PORT = 3099;
const SECRET = "smoke-secret-0123456789abcdef";
const HERE = fileURLToPath(new URL(".", import.meta.url));

// Same token format the web app signs (src/lib/collab-token.ts).
const payload = Buffer.from(
  JSON.stringify({ pid: "p1", uid: "u1", exp: Date.now() + 60_000 }),
).toString("base64url");
const token = `${payload}.${createHmac("sha256", SECRET).update(payload).digest("base64url")}`;

let failures = 0;
function check(name, ok) {
  console.log(`${ok ? "PASS" : "FAIL"} ${name}`);
  if (!ok) failures++;
}

/** Connects and resolves on the first state frame; queues the rest. */
function connect(client, { file = "f1", tok = token } = {}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://127.0.0.1:${PORT}/?token=${tok}&file=${file}&client=${client}`);
    const inbox = [];
    const timer = setTimeout(() => reject(new Error("no state within 5s")), 5000);
    ws.addEventListener("message", (e) => {
      const msg = JSON.parse(e.data);
      if (msg.type === "state") {
        clearTimeout(timer);
        resolve({ ws, state: msg, inbox });
      } else inbox.push(msg);
    });
    ws.addEventListener("close", (e) => {
      clearTimeout(timer);
      reject(Object.assign(new Error(`closed ${e.code}`), { code: e.code }));
    });
    ws.addEventListener("error", () => reject(new Error("socket error")));
  });
}

const send = (ws, msg) => ws.send(JSON.stringify(msg));
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Relay child process; killed on exit however we finish.
const relay = spawn(process.execPath, [`${HERE}server.ts`], {
  env: { ...process.env, PORT: String(PORT), COLLAB_SECRET: SECRET, COMPILER_TOKEN: "" },
  stdio: ["ignore", "inherit", "inherit"],
});
relay.on("error", (err) => {
  console.error("could not start relay:", err);
  process.exit(1);
});

try {
  // Wait for /health.
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(`http://127.0.0.1:${PORT}/health`).then((r) => r.json())).ok) break;
    } catch {
      /* not up yet */
    }
    await wait(100);
  }

  // A bad token is refused.
  await connect(9, { tok: "AAAA.AAAA" }).then(
    () => check("bad token rejected", false),
    (err) => check("bad token rejected", err.code === 4001),
  );

  // First client joins an empty room.
  const a = await connect(1);
  check("first client told to seed", a.state.first === true && a.state.data === "");

  // Its update is buffered for later joiners (no echo back to the sender).
  send(a.ws, { type: "update", data: "SGVsbG8=" }); // "Hello"
  await wait(200);

  // Second client gets the buffered state.
  const b = await connect(2);
  check("joiner receives state", b.state.first === false && b.state.data === "SGVsbG8=");

  // Updates fan out to everyone but the sender.
  send(a.ws, { type: "update", data: "Rm9saW8=" }); // "Folio"
  send(b.ws, { type: "awareness", data: "eA==" }); // "x"
  await wait(200);
  check(
    "update broadcast to peer",
    b.inbox.some((m) => m.type === "update" && m.data === "Rm9saW8="),
  );
  check("no echo to sender", !a.inbox.some((m) => m.type === "update" && m.data === "SGVsbG8="));
  check(
    "awareness relayed",
    a.inbox.some((m) => m.type === "awareness" && m.data === "eA=="),
  );

  // A hard close makes the relay announce the departure for cursor cleanup.
  a.ws.close();
  await wait(200);
  check(
    "bye on disconnect",
    b.inbox.some((m) => m.type === "bye" && m.client === 1),
  );

  b.ws.close();
} catch (err) {
  console.error(err);
  failures++;
} finally {
  relay.kill();
}

console.log(failures === 0 ? "SMOKE OK" : `SMOKE FAILED (${failures})`);
process.exit(failures === 0 ? 0 : 1);
