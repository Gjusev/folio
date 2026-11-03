// Runs in every test worker before the test files are imported.
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? "postgres://folio:folio@localhost:5432/folio_test";
process.env.COMPILER_TOKEN ??= "test-compiler-token-0123456789";
process.env.COMPILER_URL ??= "http://127.0.0.1:3999";
