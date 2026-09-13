import path from "node:path";
import { defineConfig } from "prisma/config";

/** Keeps `prisma migrate` and `prisma db seed` on the same seed script. */
export default defineConfig({
  schema: path.join("prisma", "schema.prisma"),
  migrations: { seed: "tsx --env-file=.env prisma/seed.ts" },
});
