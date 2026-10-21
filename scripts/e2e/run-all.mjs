// Runs every scripts/e2e/NNN-*.mjs feature script in order against a live API.
//   node scripts/e2e/run-all.mjs [filter]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { setup, summary } from "./lib.mjs";

const dir = path.dirname(fileURLToPath(import.meta.url));
const filter = process.argv[2];
const files = fs.readdirSync(dir).filter((f) => /^\d{3}-.*\.mjs$/.test(f) && (!filter || f.includes(filter))).sort();
const ctx = await setup();
for (const f of files) {
  console.log(`\n=== ${f}`);
  const mod = await import(pathToFileURL(path.join(dir, f)).href);
  await mod.default(ctx);
}
process.exit(summary() ? 1 : 0);
