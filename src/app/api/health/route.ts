import { NextResponse } from "next/server";
import { route } from "@/lib/http";
import { checkHealth } from "@/lib/health";

// Public on purpose (uptime monitors, container healthchecks): it reveals only
// whether the database and the compiler answer.
export const GET = route(async () => {
  const report = await checkHealth();
  return NextResponse.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "cache-control": "no-store" },
  });
});
