// pdfjs-dist ships no type declaration for the worker entry; importing it is a
// side effect only — it registers WorkerMessageHandler on globalThis so the
// legacy build can run in-process under the Next standalone server.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
