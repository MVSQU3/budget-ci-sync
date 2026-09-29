const CORS_HEADERS: Record<string, string> = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-headers": "Content-Type, Authorization, Accept",
  "access-control-max-age": "86400",
  "cache-control": "no-store",
};

export function json(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "x-content-type-options": "nosniff",
      ...CORS_HEADERS,
    },
  });
}

export function handleOptions(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export async function readJson(request: Request): Promise<
  { ok: true; value: unknown } | { ok: false; message: string }
> {
  try {
    return { ok: true, value: await request.json() };
  } catch {
    return { ok: false, message: "Corps JSON invalide." };
  }
}

export function clientIp(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first.slice(0, 64);
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp.slice(0, 64);
  return "unknown";
}

export async function runSync(
  route: string,
  handler: () => Promise<Response>,
): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    console.error(
      JSON.stringify({
        route,
        error: error instanceof Error ? error.name : "unknown",
      }),
    );
    return json({ error: "Erreur interne." }, 500);
  }
}
