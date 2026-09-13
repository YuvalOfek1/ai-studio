import fs from "node:fs";
import path from "node:path";
import { defineConfig } from "prisma/config";

// A Prisma config file turns off Prisma's own .env loading, so do it here.
if (fs.existsSync(".env")) process.loadEnvFile(".env");

export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { seed: "tsx prisma/seed.ts" },
});
