import { handleOptions, runSync } from "@/lib/http";
import { handlePull } from "@/lib/sync/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return handleOptions();
}

export function POST(request: Request) {
  return runSync("pull", () => handlePull(request));
}
