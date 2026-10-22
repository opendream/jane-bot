#!/usr/bin/env python3
"""Dev-only: builds dist-bundle/jane-demo-run-bundle-<date>.zip. Weights are NOT included (fetched by start.sh)."""
import hashlib, os, subprocess, sys, zipfile, datetime, pathlib

ROOT = pathlib.Path(__file__).resolve().parent.parent
os.chdir(ROOT)
if "--no-build" not in sys.argv:
    subprocess.run(["npm", "run", "build"], check=True)
NAME = "jane-demo-run-bundle"
stamp = datetime.datetime.now().strftime("%Y%m%d-%H%M")
out_dir = ROOT / "dist-bundle"; out_dir.mkdir(exist_ok=True)
out = out_dir / f"{NAME}-{stamp}.zip"

files = []  # (src path, arcname, executable)
for p in sorted((ROOT / "dist").rglob("*")):
    if p.is_file(): files.append((p, f"dist/{p.relative_to(ROOT / 'dist')}", False))
for s in ["serve.mjs", "fetch-weights.mjs", "weights-manifest.json"]:
    files.append((ROOT / "scripts" / s, f"scripts/{s}", s.endswith(".mjs")))
files.append((ROOT / "bundle/verify-dist.mjs", "scripts/verify-dist.mjs", True))
for s, ex in [("start.sh", True), ("start.command", True), ("README-RUN.md", False), ("FILMING-CHECKLIST.md", False), ("THIRD-PARTY-NOTICES.md", False)]:
    files.append((ROOT / "bundle" / s, s, ex))
files.append((ROOT / "LICENSE", "LICENSE", False))
commit = subprocess.run(["git", "rev-parse", "--short", "HEAD"], capture_output=True, text=True).stdout.strip()

sums = "".join(f"{hashlib.sha256(src.read_bytes()).hexdigest()}  {arc}\n" for src, arc, _ in files if arc.startswith("dist/"))
with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
    def add(arc, data, ex=False):
        zi = zipfile.ZipInfo(f"{NAME}/{arc}", date_time=datetime.datetime.now().timetuple()[:6])
        zi.compress_type = zipfile.ZIP_DEFLATED
        zi.external_attr = ((0o755 if ex else 0o644) | 0o100000) << 16
        z.writestr(zi, data)
    for src, arc, ex in files: add(arc, src.read_bytes(), ex)
    add("SHA256SUMS", sums)
    add("BUILD-INFO.txt", f"commit {commit}\nbuilt {datetime.datetime.now().strftime('%Y-%m-%d %H:%M')} BKK (UTC+7)\nweights: not included; start.sh fetches them (pinned, sha256)\n")
    zi = zipfile.ZipInfo(f"{NAME}/models/"); zi.external_attr = (0o40755 << 16) | 0x10; z.writestr(zi, "")
print(f"{out}  {out.stat().st_size/1e6:.1f} MB  ({len(files)+2} files, commit {commit})")
