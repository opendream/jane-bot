#!/usr/bin/env node
// Regenerates the self-hosted Mitr WOFF2 subsets (Thai + Latin, ~64 KB total).
// Source: google/fonts ofl/mitr (SIL OFL 1.1, Cadson Demak). Run on a machine with
// fonttools + brotli:  pyftsubset must be on PATH. Never fetched at runtime.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.resolve(here, "../src/assets/fonts");
const srcDir = path.resolve(here, "../.cache/mitr");
const BASE = "https://raw.githubusercontent.com/google/fonts/main/ofl/mitr";
const UNICODES = "U+0000-00FF,U+0E00-0E7F,U+2000-206F,U+20AC,U+2122,U+2212,U+2215";

fs.mkdirSync(srcDir, { recursive: true });
fs.mkdirSync(outDir, { recursive: true });

async function grab(name) {
  const dest = path.join(srcDir, name);
  const res = await fetch(`${BASE}/${name}`);
  if (!res.ok) throw new Error(`fetch ${name}: ${res.status}`);
  fs.writeFileSync(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}

const ofl = await grab("OFL.txt");
fs.copyFileSync(ofl, path.join(outDir, "OFL.txt"));

for (const face of ["Regular", "Bold"]) {
  const ttf = await grab(`Mitr-${face}.ttf`);
  const dest = path.join(outDir, `Mitr-${face}-latin-thai.woff2`);
  const r = spawnSync("pyftsubset", [
    ttf, `--unicodes=${UNICODES}`, "--flavor=woff2",
    "--layout-features=kern,liga,ccmp,locl,mark,mkmk,calt",
    "--no-hinting", "--desubroutinize", `--output-file=${dest}`,
  ], { stdio: "inherit" });
  if (r.status !== 0) throw new Error(`pyftsubset ${face} failed`);
}

const woff = fs.readdirSync(outDir).filter((f) => f.endsWith(".woff2"));
const total = woff.reduce((n, f) => n + fs.statSync(path.join(outDir, f)).size, 0);
console.log(`Mitr subsets: ${woff.join(", ")} (${total} bytes)`);
if (total > 72 * 1024) throw new Error(`subset too large: ${total}`);
