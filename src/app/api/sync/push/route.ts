import { handleOptions, runSync } from "@/lib/http";
import { handlePush } from "@/lib/sync/service";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return handleOptions();
}

export function POST(request: Request) {
  return runSync("push", () => handlePush(request));
}
