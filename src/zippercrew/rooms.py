"""Run worker lifecycle, append-only execution history, and human transport."""

from __future__ import annotations

import copy
import json
import os
import signal
import subprocess
import sys
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from zippergen.assistant_backends import assistant_backend_spec, assistant_settings
from zippergen.human_tasks import human_task_result_from_value
from zippergen.workspace import Workspace

from zippercrew.state import TERMINAL, apply_event, initial_state
from zippercrew.workflows import agent_roles, workflow_id


class Conflict(ValueError):
    """An operation no longer applies to the current room state."""


def directory(value: Any) -> Path:
    if not isinstance(value, str) or not value.strip():
        raise ValueError("Choose an existing directory.")
    path = Path(value).expanduser().resolve()
    if not path.is_dir():
        raise ValueError(f"Directory does not exist: {path}")
    return path


def text_field(value: Any, label: str, *, required: bool = False) -> str:
    if not isinstance(value, str) or len(value) > 30000 or (required and not value.strip()):
        raise ValueError(
            f"{label} must be {'nonempty ' if required else ''}text, up to 30,000 chars."
        )
    return value.strip()


def validate_config(data: dict[str, Any], *, demo: bool = False) -> dict[str, Any]:
    workspace = directory(data.get("workspace"))
    project = directory(data.get("project"))
    profiles = Workspace(project).assistant_configurations()
    mode = data.get("human_mode")
    if mode not in {"full", "brief", "auto"}:
        raise ValueError("Choose full, brief, or auto human involvement.")
    rounds = data.get("max_rounds")
    if type(rounds) is not int or not 1 <= rounds <= 100:
        raise ValueError("Maximum rounds must be an integer between 1 and 100.")
    agents = {}
    for role in agent_roles(data):
        binding = data.get("agents", {}).get(role, {})
        name = binding.get("profile")
        if demo:
            backend = "demo"
            name = "Scripted demo"
        else:
            if name not in profiles:
                raise ValueError(f"Choose an existing ZipperGen profile for {role}.")
            backend = profiles[name]["backend"]
        agents[role] = {
            "profile": name,
            "backend": backend,
            "access": "write" if role == "Implementer" else "read-only",
            "instructions": text_field(binding.get("instructions", ""), role),
        }
        if not demo:
            selection = dict(profiles[name])
            overrides = binding.get("settings", {})
            if not isinstance(overrides, dict):
                raise ValueError("Participant settings must be an object.")
            spec = assistant_backend_spec(backend)
            if spec is None or set(overrides) - set(spec.setting_options):
                raise ValueError(f"Unsupported settings for {backend}.")
            # Empty values inherit the named profile; native CLIs validate IDs.
            selection.update({key: value for key, value in overrides.items() if value})
            agents[role].update(assistant_settings(selection))
    return {
        "workflow": workflow_id(data),
        "workspace": str(workspace),
        "project": str(project),
        "task": text_field(data.get("task"), "Task", required=True),
        "human_mode": mode,
        "max_rounds": rounds,
        "agents": agents,
        "demo": demo,
    }


class Run:
    def __init__(self, root: Path, config: dict[str, Any], room_id: str) -> None:
        self.root = root
        self.config = config
        self.state = initial_state(room_id, config)
        self.started_at: float | None = None
        self.ended_at: float | None = None
        self.condition = threading.Condition(threading.RLock())
        self.process: subprocess.Popen[str] | None = None
        self.thread: threading.Thread | None = None
        self.answer_in_flight: str | None = None
        self.pause_guard: subprocess.Popen[str] | None = None

    def snapshot(self) -> dict[str, Any]:
        with self.condition:
            return copy.deepcopy(self.state)

    def reduce(self, event: dict[str, Any]) -> None:
        apply_event(self.state, event)
        if event["type"] == "room.started":
            self.started_at = event.get("time")
        if self.state["status"] in TERMINAL:
            self.ended_at = event.get("time")

    def record(self, event: dict[str, Any]) -> None:
        with self.condition:
            if self.state["status"] in TERMINAL:
                return
            # A final event may already have been in the stdout pipe when Pause
            # arrived. Let the worker exit or wait for its Human normally.
            if self.state["status"] == "paused" and event["type"] in {
                "human.required",
                "room.completed",
                "room.failed",
            }:
                try:
                    self._signal(signal.SIGCONT)
                except Conflict:
                    pass  # A completed worker may already have exited.
                self._release_pause_guard()
                self.record({"type": "room.resumed"})
            event = {**event, "id": self.state["version"] + 1, "time": time.time()}
            with (self.root / "events.jsonl").open("a", encoding="utf-8") as stream:
                stream.write(json.dumps(event) + "\n")
                stream.flush()
            self.reduce(event)
            if event["type"] == "human.responded":
                self.answer_in_flight = None
            self.condition.notify_all()

    def start(self) -> None:
        self.root.mkdir(parents=True, mode=0o700)
        (self.root / "config.json").write_text(json.dumps(self.config, indent=2), encoding="utf-8")
        self.record({"type": "room.started", "config": self.config})
        try:
            with (self.root / "worker.log").open("w", encoding="utf-8") as errors:
                self.process = subprocess.Popen(
                    [sys.executable, "-m", "zippercrew.worker"],
                    stdin=subprocess.PIPE,
                    stdout=subprocess.PIPE,
                    stderr=errors,
                    text=True,
                    bufsize=1,
                    start_new_session=True,
                )
            assert self.process.stdin is not None
            self.process.stdin.write(json.dumps(self.config) + "\n")
            self.process.stdin.flush()
            self.thread = threading.Thread(target=self._observe, daemon=True)
            self.thread.start()
        except OSError as exc:
            self.record({"type": "room.failed", "error": f"Could not launch room: {exc}"})

    def _observe(self) -> None:
        assert self.process is not None and self.process.stdout is not None
        try:
            for line in self.process.stdout:
                self.record(json.loads(line))
            code = self.process.wait()
            if self.state["status"] not in TERMINAL:
                self.record(
                    {
                        "type": "room.failed",
                        "error": f"Room worker exited ({code}). "
                        "See worker.log in this room's data directory.",
                    }
                )
        except (OSError, ValueError) as exc:
            self.stop(f"Room transport failed: {exc}", failed=True)
        finally:
            self.process.stdout.close()
            if self.process.stdin:
                self.process.stdin.close()

    def respond(self, request_id: str, value: Any, note: Any = None) -> None:
        with self.condition:
            pending = self.state["pending"]
            if (
                self.state["status"] in TERMINAL
                or not pending
                or pending["id"] != request_id
                or self.answer_in_flight
            ):
                raise Conflict(
                    "This human request has already been answered or is no longer active."
                )
            if not isinstance(value, str) or len(value) > 30000:
                raise ValueError("A human response must be text, up to 30,000 characters.")
            result = human_task_result_from_value(pending["spec"], value)
            canonical = result[pending["spec"]["output"]]
            payload = {"request_id": request_id, "value": canonical}
            if note is not None:
                if pending["spec"]["kind"] != "select" or canonical != "Another round":
                    raise ValueError("A note can only accompany Another round.")
                if not isinstance(note, str) or len(note) > 30000:
                    raise ValueError("A note must be text, up to 30,000 characters.")
                payload["note"] = note
            assert self.process is not None and self.process.stdin is not None
            try:
                self.process.stdin.write(json.dumps(payload) + "\n")
                self.process.stdin.flush()
            except (OSError, ValueError) as exc:
                raise Conflict("The room worker is no longer accepting answers.") from exc
            self.answer_in_flight = request_id

    def pause(self) -> None:
        with self.condition:
            if self.state["status"] == "paused":
                return
            if self.state["status"] != "running" or self.state["pending"] or self.answer_in_flight:
                raise Conflict("Only an actively running task can be paused.")
            # A stopped worker cannot notice stdin EOF. This separate watchdog
            # ensures a service crash cannot strand its suspended process group.
            assert self.process is not None
            self.pause_guard = subprocess.Popen(
                [
                    sys.executable,
                    "-c",
                    (
                        "import os, signal, sys, time\n"
                        "group = int(sys.argv[1])\n"
                        "if not sys.stdin.readline():\n"
                        "    try:\n"
                        "        os.killpg(group, signal.SIGTERM)\n"
                        "        os.killpg(group, signal.SIGCONT)\n"
                        "        time.sleep(1)\n"
                        "        os.killpg(group, signal.SIGKILL)\n"
                        "    except ProcessLookupError: pass\n"
                    ),
                    str(self.process.pid),
                ],
                stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                text=True,
                start_new_session=True,
            )
            try:
                self._signal(signal.SIGSTOP)
            except BaseException:
                self._release_pause_guard()
                raise
            self.record({"type": "room.paused"})

    def resume(self) -> None:
        with self.condition:
            if self.state["status"] != "paused":
                raise Conflict("This run is not paused.")
            self._signal(signal.SIGCONT)
            self._release_pause_guard()
            self.record({"type": "room.resumed"})

    def _release_pause_guard(self) -> None:
        guard, self.pause_guard = self.pause_guard, None
        if guard is not None:
            try:
                assert guard.stdin is not None
                guard.stdin.write("released\n")
                guard.stdin.close()
            except (BrokenPipeError, OSError):
                pass
            guard.wait(timeout=3)

    def _signal(self, sig: int) -> None:
        if self.process is None or self.process.poll() is not None:
            raise Conflict("The room worker is no longer running.")
        try:
            os.killpg(self.process.pid, sig)
        except ProcessLookupError as exc:
            raise Conflict("The room worker is no longer running.") from exc

    def stop(
        self,
        reason: str = "Stopped by the Human. Edits remain in the workspace.",
        *,
        failed: bool = False,
        expected_request_id: Any = None,
    ) -> None:
        with self.condition:
            if expected_request_id is not None and (
                not self.state["pending"]
                or self.state["pending"]["id"] != expected_request_id
                or self.answer_in_flight
            ):
                raise Conflict("This decision is no longer waiting. Reopen the current task.")
            if self.state["status"] in TERMINAL:
                return
            if self.process is not None:
                try:
                    os.killpg(self.process.pid, signal.SIGTERM)
                    # A suspended process cannot handle SIGTERM until continued.
                    if self.state["status"] == "paused":
                        os.killpg(self.process.pid, signal.SIGCONT)
                    try:
                        self.process.wait(timeout=2)
                    except subprocess.TimeoutExpired:
                        pass
                    # Also reap children whose parent exited before they did.
                    os.killpg(self.process.pid, signal.SIGKILL)
                except ProcessLookupError:
                    pass
                self.process.wait(timeout=3)
            self._release_pause_guard()
            self.record({"type": "room.failed" if failed else "room.stopped", "error": reason})


class Runs:
    def __init__(self, root: Path) -> None:
        self.root = root
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.lock = threading.RLock()
        self.items: dict[str, Run] = {}
        for path in sorted(root.glob("*/config.json")):
            config = json.loads(path.read_text(encoding="utf-8"))
            room = Run(path.parent, config, path.parent.name)
            journal = path.parent / "events.jsonl"
            if journal.exists():
                lines = journal.read_text(encoding="utf-8").splitlines()
                for i, line in enumerate(lines):
                    try:
                        room.reduce(json.loads(line))
                    except ValueError:
                        if i != len(lines) - 1:
                            raise
                        # A crash may truncate the last append. Repair only that suffix.
                        journal.write_text("\n".join(lines[:i]) + "\n", encoding="utf-8")
            if room.state["status"] not in TERMINAL:
                room.record(
                    {
                        "type": "room.stopped",
                        "error": "Service interrupted. "
                        "History retained; use Run again to continue. Edits remain.",
                    }
                )
            self.items[path.parent.name] = room

    def create(self, config: dict[str, Any]) -> Run:
        with self.lock:
            workspace = Path(config["workspace"])
            for existing in self.items.values():
                other = Path(existing.config["workspace"])
                if existing.state["status"] not in TERMINAL and (
                    workspace.is_relative_to(other) or other.is_relative_to(workspace)
                ):
                    raise Conflict("A run is already using this workspace. Stop it first.")
            room_id = uuid.uuid4().hex
            room = Run(self.root / room_id, config, room_id)
            self.items[room_id] = room
            room.start()
            return room

    def get(self, room_id: str) -> Run:
        with self.lock:
            if room_id not in self.items:
                raise KeyError("Room not found.")
            return self.items[room_id]

    def history(self) -> list[dict[str, Any]]:
        with self.lock:
            return [
                {
                    "id": room.state["id"],
                    "status": room.state["status"],
                    "task": room.config["task"],
                    "round": room.state["round"],
                }
                for room in reversed(list(self.items.values()))
            ]

    def close(self) -> None:
        with self.lock:
            for room in self.items.values():
                room.stop("Service stopped. Edits remain in the workspace.")
