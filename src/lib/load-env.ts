import fs from "node:fs";
import path from "node:path";

/**
 * Loads .env for processes Next.js does not start for us (the worker, the seed).
 *
 * Import this FIRST — before any module that reads process.env at import time —
 * because ES modules evaluate their imports in order, and `src/lib/queue.ts`
 * builds its Redis connection as soon as it loads.
 */
const file = path.resolve(process.cwd(), ".env");

if (fs.existsSync(file)) {
  try {
    process.loadEnvFile(file);
  } catch {
    // Node < 20.12 has no loadEnvFile — parse the simple KEY=value case ourselves
    for (const line of fs.readFileSync(file, "utf8").split("\n")) {
      const match = /^\s*([\w.-]+)\s*=\s*(.*)?\s*$/.exec(line);
      if (!match || line.trimStart().startsWith("#")) continue;
      const value = (match[2] ?? "").trim().replace(/^(['"])(.*)\1$/, "$2");
      if (process.env[match[1]] === undefined) process.env[match[1]] = value;
    }
  }
}
