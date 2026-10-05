"""Persistent Room configuration, independent of immutable execution journals.

Legacy run directories stay in place. A small atomic JSON record owns their IDs;
no source workspace or shared assistant profile is ever owned by this catalog.
"""

from __future__ import annotations

import copy
import json
import shutil
import time
import uuid
from pathlib import Path
from typing import Any

from zippercrew.rooms import Conflict, Runs, text_field
from zippercrew.state import TERMINAL


def room_config(data: dict[str, Any]) -> dict[str, Any]:
    """Allow incomplete setup; execution performs full upstream validation."""
    result: dict[str, Any] = {}
    for field in ("workspace", "project"):
        result[field] = text_field(data.get(field, ""), field)
    result["human_mode"] = data.get("human_mode", "brief")
    if result["human_mode"] not in {"full", "brief", "auto"}:
        raise ValueError("Choose full, brief, or auto human involvement.")
    rounds = data.get("max_rounds", 4)
    if type(rounds) is not int or not 1 <= rounds <= 100:
        raise ValueError("Maximum rounds must be between 1 and 100.")
    result["max_rounds"] = rounds
    result["agents"] = {}
    for role in ("Implementer", "Reviewer"):
        binding = data.get("agents", {}).get(role, {})
        settings = binding.get("settings", {})
        if not isinstance(settings, dict) or set(settings) - {"model", "reasoning_effort"}:
            raise ValueError("Unknown participant settings.")
        result["agents"][role] = {
            "profile": text_field(binding.get("profile", ""), "Profile"),
            "instructions": text_field(binding.get("instructions", ""), "Instructions"),
            "settings": {key: text_field(value, key) for key, value in settings.items()},
        }
    motion = data.get("motion", "full")
    if motion not in {"full", "reduced"}:
        raise ValueError("Choose full or reduced animation.")
    result.update(environment="Corner Café", motion=motion)
    return result


class Catalog:
    def __init__(self, root: Path, runs: Runs) -> None:
        self.root, self.runs = root, runs
        root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.records: dict[str, dict[str, Any]] = {}
        for path in sorted(root.glob("*.json")):
            record = json.loads(path.read_text())
            if record["id"] != path.stem:
                raise ValueError("Invalid Room record ID.")
            self.records[path.stem] = record
        # Finish an interrupted deletion before considering legacy adoption.
        for record in list(self.records.values()):
            if record.get("deleted"):
                self._remove(record)
        owned = {run for record in self.records.values() for run in record["runs"]}
        for run_id, run in runs.items.items():
            if run_id in owned:
                continue
            owner = run.config.get("room_id")
            if owner in self.records:
                record = self.get(owner)
                record["runs"].append(run_id)
                self._save(record)
                continue
            config = copy.deepcopy(run.config)
            # Preserve the effective configuration of imported historical runs.
            for binding in config["agents"].values():
                binding["settings"] = {
                    k: binding[k] for k in ("model", "reasoning_effort") if k in binding
                }
            record = self.create({"config": config, "brief": config["task"]}, room_id=run_id)
            record["runs"] = [run_id]
            self._save(record)

    def _save(self, record: dict[str, Any]) -> None:
        target = self.root / f"{record['id']}.json"
        temp = target.with_suffix(".tmp")
        temp.write_text(json.dumps(record, indent=2))
        temp.replace(target)
        self.records[record["id"]] = copy.deepcopy(record)

    def get(self, room_id: str) -> dict[str, Any]:
        with self.runs.lock:
            if room_id not in self.records:
                raise KeyError("Room not found.")
            return copy.deepcopy(self.records[room_id])

    def create(self, data: dict[str, Any], *, room_id: str | None = None) -> dict[str, Any]:
        with self.runs.lock:
            config = room_config(data.get("config", {}))
            name = data.get("name") or (
                Path(config["workspace"]).name if config["workspace"] else "Pair programming"
            )
            record: dict[str, Any] = {
                "id": room_id or uuid.uuid4().hex,
                "name": self._name(name),
                "process": "Pair Programming",
                "config": config,
                "brief": text_field(data.get("brief", ""), "Brief"),
                "created_at": time.time(),
                "updated_at": time.time(),
                "runs": [],
            }
            self._save(record)
            return self.get(record["id"])

    @staticmethod
    def _name(value: Any) -> str:
        name = text_field(value, "Room name", required=True)
        if len(name) > 120:
            raise ValueError("Room names may contain up to 120 characters.")
        return name

    def _idle(self, record: dict[str, Any]) -> None:
        if any(self.runs.get(run).state["status"] not in TERMINAL for run in record["runs"]):
            raise Conflict("Stop the active run before changing or deleting this Room.")

    def update(self, room_id: str, data: dict[str, Any]) -> dict[str, Any]:
        with self.runs.lock:
            record = self.get(room_id)
            if "name" in data:
                record["name"] = self._name(data["name"])
            if "config" in data or "brief" in data:
                self._idle(record)
                if "config" in data:
                    record["config"] = room_config(data["config"])
                if "brief" in data:
                    record["brief"] = text_field(data["brief"], "Brief")
            if "motion" in data:
                if data["motion"] not in {"full", "reduced"}:
                    raise ValueError("Choose full or reduced animation.")
                record["config"]["motion"] = data["motion"]
            record["updated_at"] = time.time()
            self._save(record)
            return self.get(room_id)

    def start(self, room_id: str, config: dict[str, Any]) -> dict[str, Any]:
        with self.runs.lock:
            record = self.get(room_id)
            self._idle(record)
            run = self.runs.create({**config, "room_id": room_id})
            record["runs"].append(run.state["id"])
            record["updated_at"] = time.time()
            self._save(record)
            return run.snapshot()

    def history(self, room_id: str) -> list[dict[str, Any]]:
        with self.runs.lock:
            result = []
            for number, run_id in enumerate(self.get(room_id)["runs"], 1):
                run = self.runs.get(run_id)
                state = run.snapshot()
                result.append(
                    {
                        "id": run_id,
                        "number": number,
                        "status": state["status"],
                        "round": state["round"],
                        "task": run.config["task"],
                        "outcome": state["outcome"] or state["error"],
                        "started_at": run.started_at,
                        "ended_at": run.ended_at,
                    }
                )
            return result[::-1]

    def list(self) -> list[dict[str, Any]]:
        with self.runs.lock:
            return [
                {**copy.deepcopy(record), "latest": next(iter(self.history(record["id"])), None)}
                for record in sorted(
                    self.records.values(), key=lambda r: r["updated_at"], reverse=True
                )
            ]

    def delete(self, room_id: str, confirmation: Any) -> None:
        with self.runs.lock:
            record = self.get(room_id)
            if confirmation != record["name"]:
                raise ValueError("Confirm the Room name to delete its run history and traces.")
            self._idle(record)
            self._check_targets(record)
            record["deleted"] = True
            self._save(record)
            self._remove(record)

    def _check_targets(self, record: dict[str, Any]) -> None:
        for run_id in record["runs"]:
            run = self.runs.items.get(run_id)
            if run:
                if run.root.is_symlink() or run.root.parent.resolve() != self.runs.root.resolve():
                    raise ValueError("Refusing to delete a run outside local ZipperCrew storage.")
                if Path(run.config["workspace"]).resolve().is_relative_to(run.root.resolve()):
                    raise ValueError(
                        "A source workspace overlaps these artifacts; deletion refused."
                    )

    def _remove(self, record: dict[str, Any]) -> None:
        self._check_targets(record)
        # Only directories obtained from the local execution registry are removed.
        # Workspace and profile paths in config are NEVER deletion targets.
        for run_id in record["runs"]:
            run = self.runs.items.get(run_id)
            if run:
                shutil.rmtree(run.root)
                del self.runs.items[run_id]
        (self.root / f"{record['id']}.json").unlink()
        del self.records[record["id"]]
