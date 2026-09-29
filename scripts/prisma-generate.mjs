import { spawnSync } from "node:child_process";

const placeholder =
  "postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder?schema=public";

const env = { ...process.env };
if (!env.DATABASE_URL) env.DATABASE_URL = placeholder;
if (!env.DATABASE_URL_UNPOOLED) env.DATABASE_URL_UNPOOLED = placeholder;

const result = spawnSync("npx", ["prisma", "generate"], {
  env,
  stdio: "inherit",
});

process.exit(result.status ?? 1);
