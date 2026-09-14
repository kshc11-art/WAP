from __future__ import annotations

import argparse
import json
import mimetypes
import secrets
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, quote, unquote, urlparse

from .core import read_json, write_json
from .workflow import automation_dir_for, package_dir_for


class BridgeServer:
    def __init__(self, run_dir: Path, host: str = "127.0.0.1", port: int = 8765):
        self.run_dir = run_dir.resolve()
        self.package_dir = package_dir_for(self.run_dir).resolve()
        self.auto_dir = automation_dir_for(self.run_dir).resolve()
        self.manifest_path = self.auto_dir / "manifest.json"
        self.host = host
        self.port = port
        self.token_path = self.auto_dir / "bridge_token.txt"
        self.token = self.token_path.read_text(encoding="utf-8").strip() if self.token_path.exists() else secrets.token_urlsafe(24)
        self.token_path.parent.mkdir(parents=True, exist_ok=True)
        self.token_path.write_text(self.token, encoding="utf-8")

    def serve(self):
        outer = self

        class Handler(BaseHTTPRequestHandler):
            server_version = "KRISSAnnualFeeBridge/0.1"

            def _cors(self):
                self.send_header("Access-Control-Allow-Origin", "*")
                self.send_header("Access-Control-Allow-Headers", "Content-Type, X-KRISS-Token")
                self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")

            def _authorized(self):
                parsed = urlparse(self.path)
                qs = parse_qs(parsed.query)
                supplied = self.headers.get("X-KRISS-Token") or (qs.get("token", [""])[0])
                return supplied == outer.token

            def do_OPTIONS(self):
                self.send_response(HTTPStatus.NO_CONTENT)
                self._cors()
                self.end_headers()

            def _json(self, code, obj):
                data = json.dumps(obj, ensure_ascii=False, indent=2).encode("utf-8")
                self.send_response(code)
                self._cors()
                self.send_header("Content-Type", "application/json; charset=utf-8")
                self.send_header("Content-Length", str(len(data)))
                self.end_headers()
                try:
                    self.wfile.write(data)
                except (BrokenPipeError, ConnectionResetError):
                    pass

            def do_GET(self):
                if not self._authorized():
                    return self._json(HTTPStatus.UNAUTHORIZED, {"error": "invalid token"})
                parsed = urlparse(self.path)
                path = parsed.path
                if path == "/api/manifest":
                    return self._json(HTTPStatus.OK, read_json(outer.manifest_path))
                if path.startswith("/api/file/"):
                    rel = unquote(path[len("/api/file/"):]).replace("\\", "/")
                    target = (outer.package_dir / rel).resolve()
                    if (
                        not target.is_relative_to(outer.package_dir)
                        or target.is_relative_to(outer.auto_dir)
                        or not target.is_file()
                    ):
                        return self._json(HTTPStatus.NOT_FOUND, {"error": "file not found"})
                    data = target.read_bytes()
                    self.send_response(HTTPStatus.OK)
                    self._cors()
                    self.send_header("Content-Type", mimetypes.guess_type(target.name)[0] or "application/octet-stream")
                    self.send_header("Content-Length", str(len(data)))
                    self.send_header("Content-Disposition", f"attachment; filename*=UTF-8''{quote(target.name)}")
                    self.end_headers()
                    try:
                        self.wfile.write(data)
                    except (BrokenPipeError, ConnectionResetError):
                        pass
                    return
                return self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})

            def do_POST(self):
                if not self._authorized():
                    return self._json(HTTPStatus.UNAUTHORIZED, {"error": "invalid token"})
                parsed = urlparse(self.path)
                if parsed.path != "/api/status":
                    return self._json(HTTPStatus.NOT_FOUND, {"error": "not found"})
                length = int(self.headers.get("Content-Length", "0"))
                body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
                job_id = body.get("job_id")
                status = body.get("status")
                manifest = read_json(outer.manifest_path)
                found = False
                for job in manifest.get("jobs", []):
                    if job.get("job_id") == job_id:
                        job["status"] = status
                        if body.get("portal_result") is not None:
                            job["portal_result"] = body.get("portal_result")
                        found = True
                        break
                if not found:
                    return self._json(HTTPStatus.NOT_FOUND, {"error": "job not found"})
                write_json(outer.manifest_path, manifest)
                return self._json(HTTPStatus.OK, {"ok": True})

            def log_message(self, fmt, *args):
                print("[bridge]", fmt % args)

        print(f"Bridge: http://{self.host}:{self.port}")
        print(f"Token : {self.token}")
        print("Tampermonkey 설정 화면에 위 URL과 Token을 입력하세요.")
        ThreadingHTTPServer((self.host, self.port), Handler).serve_forever()
