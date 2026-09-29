/**
 * Neon pooler URLs need `pgbouncer=true` so Prisma does not keep named
 * prepared statements. Each serverless instance should hold a single connection.
 */
export function withServerlessParams(connectionString: string): string {
  const url = new URL(connectionString);
  if (url.hostname.includes("-pooler") && !url.searchParams.has("pgbouncer")) {
    url.searchParams.set("pgbouncer", "true");
  }
  if (!url.searchParams.has("connection_limit")) {
    url.searchParams.set("connection_limit", "1");
  }
  if (!url.searchParams.has("connect_timeout")) {
    url.searchParams.set("connect_timeout", "15");
  }
  return url.toString();
}
