"""Loopback HTTP + SSE. No framework, database, or frontend build required."""

from __future__ import annotations

import argparse
import fcntl
import json
import signal
from concurrent.futures import ThreadPoolExecutor
from dataclasses import asdict
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

from zippergen.assistant_backends import check_cli_assistant
from zippergen.workspace import Workspace, WorkspaceError

from zippercrew.adapter import source_root
from zippercrew.rooms import Conflict, Rooms, directory, text_field, validate_config
from zippercrew.state import TERMINAL

STATIC = Path(__file__).parent / "static"


class Application(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, port: int, data_dir: Path, project: Path, demo: bool = False) -> None:
        data_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.data_lock = (data_dir / "service.lock").open("w")
        try:
            fcntl.flock(self.data_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            self.data_lock.close()
            raise ValueError(
                f"ZipperCrew is already running with data directory {data_dir}. "
                "Open the existing instance in your browser, or stop it in its terminal "
                "with Ctrl-C before starting again."
            ) from exc
        self.rooms = Rooms(data_dir / "rooms")
        self.project = str(project.resolve())
        self.demo = demo
        self.checks: dict[str, dict[str, Any]] = {}
        if not demo:
            with ThreadPoolExecutor(max_workers=2) as pool:
                for result in pool.map(check_cli_assistant, ("codex", "claude")):
                    self.checks[result.backend] = asdict(result)
        super().__init__(("127.0.0.1", port), Handler)

    def server_close(self) -> None:
        self.rooms.close()
        super().server_close()
        self.data_lock.close()


class Handler(BaseHTTPRequestHandler):
    server: Application
    protocol_version = "HTTP/1.1"

    def log_message(self, format: str, *args: Any) -> None:
        # Requests contain local workspace paths; keep them out of routine logs.
        pass

    def trusted(self, mutation: bool = False) -> bool:
        port = self.server.server_port
        hosts = {f"127.0.0.1:{port}", f"localhost:{port}"}
        origin = self.headers.get("Origin")
        valid = (
            self.headers.get("Host") in hosts
            and (not origin or origin in {f"http://{host}" for host in hosts})
            and self.headers.get("Sec-Fetch-Site") != "cross-site"
        )
        if mutation:
            valid = (
                valid
                and self.headers.get("X-ZipperCrew") == "1"
                and (self.headers.get("Content-Type", "").split(";")[0] == "application/json")
            )
        if not valid:
            self.close_connection = True
            self.reply(403, {"error": "Use the local ZipperCrew page to access this service."})
        return valid

    def reply(self, code: int, payload: Any, mime: str = "application/json") -> None:
        body = json.dumps(payload).encode() if mime == "application/json" else payload
        self.send_response(code)
        self.send_header("Content-Type", mime)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header(
            "Content-Security-Policy",
            "default-src 'self'; object-src 'none'; frame-ancestors 'none'; base-uri 'none'",
        )
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        if not self.trusted():
            return
        try:
            url = urlsplit(self.path)
            path = url.path
            if path in {"/", "/app.js", "/style.css"}:
                name, mime = {
                    "/": ("index.html", "text/html; charset=utf-8"),
                    "/app.js": ("app.js", "text/javascript; charset=utf-8"),
                    "/style.css": ("style.css", "text/css; charset=utf-8"),
                }[path]
                self.reply(200, (STATIC / name).read_bytes(), mime)
            elif path == "/api/bootstrap":
                self.reply(
                    200,
                    {
                        "project": self.server.project,
                        "demo": self.server.demo,
                        "checks": self.server.checks,
                    },
                )
            elif path == "/api/profiles":
                project = directory(parse_qs(url.query).get("project", [self.server.project])[0])
                self.reply(200, {"profiles": Workspace(project).assistant_configurations()})
            elif path == "/api/rooms":
                self.reply(200, self.server.rooms.history())
            elif path.startswith("/api/rooms/"):
                parts = path.strip("/").split("/")
                room = self.server.rooms.get(parts[2])
                if len(parts) == 3:
                    self.reply(200, room.snapshot())
                elif parts[3:] == ["events"]:
                    self.stream(room)
                elif parts[3:] == ["trace"]:
                    self.reply(
                        200, (room.root / "events.jsonl").read_bytes(), "application/x-ndjson"
                    )
                else:
                    self.reply(404, {"error": "Not found."})
            else:
                self.reply(404, {"error": "Not found."})
        except (BrokenPipeError, ConnectionResetError):
            pass
        except KeyError as exc:
            self.reply(404, {"error": str(exc)})
        except (ValueError, OSError, WorkspaceError) as exc:
            self.reply(400, {"error": str(exc)})

    def stream(self, room: Any) -> None:
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Connection", "close")
        self.end_headers()
        self.close_connection = True
        self.connection.settimeout(15)
        version = -1
        while True:
            with room.condition:
                room.condition.wait_for(
                    lambda seen=version: room.state["version"] != seen, timeout=10
                )
                state = room.snapshot()
            if state["version"] != version:
                version = state["version"]
                self.wfile.write(
                    f"id: {version}\nevent: state\ndata: {json.dumps(state)}\n\n".encode()
                )
            else:
                self.wfile.write(b": keepalive\n\n")
            self.wfile.flush()
            if state["status"] in TERMINAL:
                return

    def do_POST(self) -> None:
        if not self.trusted(mutation=True):
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if not 0 < length <= 150000:
                self.close_connection = True
                self.reply(413, {"error": "Request must be between 1 and 150,000 bytes."})
                return
            data = json.loads(self.rfile.read(length))
            if not isinstance(data, dict):
                raise ValueError("Request must be an object.")
            path = urlsplit(self.path).path
            if path == "/api/profiles":
                project = directory(data.get("project"))
                name = text_field(data.get("name"), "Profile name", required=True)
                backend = data.get("backend")
                if backend not in {"codex", "claude"}:
                    raise ValueError("Choose Codex or Claude.")
                workspace = Workspace(project)
                if name in workspace.assistant_configurations():
                    raise Conflict("That profile already exists. Choose a new name.")
                workspace.save_assistant_configuration(name, backend)
                self.reply(201, {"profiles": workspace.assistant_configurations()})
            elif path == "/api/rooms":
                config = validate_config(data, demo=self.server.demo)
                for binding in config["agents"].values():
                    if not self.server.demo:
                        check = self.server.checks[binding["backend"]]
                        if not check["supported"]:
                            raise ValueError(check["detail"])
                room = self.server.rooms.create(config)
                self.reply(201, room.snapshot())
            elif path.startswith("/api/rooms/"):
                parts = path.strip("/").split("/")
                room = self.server.rooms.get(parts[2])
                if parts[3:] == ["answer"]:
                    room.respond(data.get("request_id", ""), data.get("value"))
                elif parts[3:] == ["stop"]:
                    room.stop()
                else:
                    self.reply(404, {"error": "Not found."})
                    return
                self.reply(200, room.snapshot())
            else:
                self.reply(404, {"error": "Not found."})
        except Conflict as exc:
            self.reply(409, {"error": str(exc)})
        except KeyError as exc:
            self.reply(404, {"error": str(exc)})
        except (ValueError, TypeError, AttributeError, OSError, WorkspaceError) as exc:
            self.reply(400, {"error": str(exc)})


def main() -> None:
    parser = argparse.ArgumentParser(description="ZipperCrew — make the process visible")
    parser.add_argument("--port", type=int, default=8765)
    parser.add_argument("--data-dir", type=Path, default=Path(".zippercrew"))
    parser.add_argument("--project", type=Path, default=Path.cwd())
    parser.add_argument("--demo", action="store_true", help="Scripted agents; no files changed")
    args = parser.parse_args()
    try:
        source_root()
        app = Application(args.port, args.data_dir.resolve(), args.project, args.demo)
    except (ValueError, OSError) as exc:
        parser.exit(1, f"zippercrew: {exc}\n")

    def interrupt(signum: int, frame: Any) -> None:
        raise KeyboardInterrupt

    signal.signal(signal.SIGTERM, interrupt)
    print(
        f"ZipperCrew{' · DEMO' if args.demo else ''} — http://127.0.0.1:{app.server_port}",
        flush=True,
    )
    try:
        app.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        app.server_close()


if __name__ == "__main__":
    main()
