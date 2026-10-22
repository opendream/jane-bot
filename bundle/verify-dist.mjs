#!/usr/bin/env node
// Checks the prebuilt app against SHA256SUMS (written when the bundle was made). Node only.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const lines = fs.readFileSync(path.join(root, "SHA256SUMS"), "utf8").trim().split("\n");
let bad = 0;
for (const l of lines) {
  const [sum, rel] = l.split(/\s+\*?/);
  const f = path.join(root, rel);
  const got = fs.existsSync(f) ? crypto.createHash("sha256").update(fs.readFileSync(f)).digest("hex") : "missing";
  if (got !== sum) { bad++; console.error(`  MISMATCH ${rel}`); }
}
if (bad) { console.error(`${bad} file(s) differ from the bundle. Re-extract the zip.`); process.exit(1); }
console.log(`   ${lines.length} files OK`);
