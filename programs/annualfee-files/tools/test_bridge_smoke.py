from __future__ import annotations

import argparse
import json
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from kriss_annual_fee.workflow import AUTOMATION_DIR_NAME, automation_dir_for


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return int(s.getsockname()[1])


def request_json(url: str, token: str, *, method: str = "GET", body=None):
    data = None if body is None else json.dumps(body).encode("utf-8")
    headers = {"X-KRISS-Token": token}
    if data is not None:
        headers["Content-Type"] = "application/json"
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=5) as r:
        return json.load(r)


def main() -> int:
    ap = argparse.ArgumentParser(description="Smoke-test localhost bridge auth/manifest/file/status/path traversal")
    ap.add_argument("run", type=Path, help="prepare output directory, e.g. 2026년 3분기 연차관리")
    args = ap.parse_args()
    run_dir = args.run.resolve()
    auto_dir = automation_dir_for(run_dir)
    manifest = auto_dir / "manifest.json"
    if not manifest.is_file():
        raise SystemExit(f"manifest not found: {manifest}")
    original = manifest.read_bytes()
    port = free_port()
    root = ROOT
    proc = subprocess.Popen(
        [sys.executable, str(root / "run.py"), "serve", "--run", str(run_dir), "--port", str(port)],
        cwd=root,
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
    )
    try:
        token_path = auto_dir / "bridge_token.txt"
        for _ in range(60):
            if token_path.is_file():
                break
            if proc.poll() is not None:
                raise RuntimeError("bridge process exited early")
            time.sleep(0.1)
        token = token_path.read_text(encoding="utf-8").strip()
        base = f"http://127.0.0.1:{port}"
        last_error = None
        for _ in range(60):
            try:
                m = request_json(base + "/api/manifest", token)
                break
            except Exception as e:
                last_error = e
                if proc.poll() is not None:
                    raise RuntimeError("bridge process exited before listening") from e
                time.sleep(0.1)
        else:
            raise RuntimeError(f"bridge did not start: {last_error}")
        jobs = m.get("jobs") or []
        if not jobs:
            raise AssertionError("manifest jobs empty")
        job = jobs[0]
        rel = job["pdf_relpath"]
        encoded = "/".join(quote(part, safe="") for part in rel.split("/"))
        req = urllib.request.Request(base + "/api/file/" + encoded, headers={"X-KRISS-Token": token})
        with urllib.request.urlopen(req, timeout=10) as r:
            magic = r.read(8)
        if not magic.startswith(b"%PDF"):
            raise AssertionError("PDF endpoint did not return PDF")

        request_json(base + "/api/status", token, method="POST", body={
            "job_id": job["job_id"], "status": "bridge-smoke", "portal_result": {"smoke": True}
        })
        m2 = request_json(base + "/api/manifest", token)
        if m2["jobs"][0]["status"] != "bridge-smoke":
            raise AssertionError("status update did not persist")

        negative_cases = [
            (urllib.request.Request(base + "/api/manifest"), 401),
            (urllib.request.Request(base + "/api/file/" + quote(AUTOMATION_DIR_NAME, safe="") + "/manifest.json", headers={"X-KRISS-Token": token}), 404),
        ]
        for req, expected in negative_cases:
            try:
                urllib.request.urlopen(req, timeout=5)
            except urllib.error.HTTPError as e:
                if e.code != expected:
                    raise AssertionError(f"{req.full_url}: expected {expected}, got {e.code}")
            else:
                raise AssertionError(f"{req.full_url}: expected HTTP {expected}")

        print(json.dumps({"ok": True, "jobs": len(jobs), "auth": True, "path_traversal_blocked": True}, ensure_ascii=False))
        return 0
    finally:
        manifest.write_bytes(original)
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


if __name__ == "__main__":
    raise SystemExit(main())
