"""Application preferences live outside room and execution configuration."""

import json
import threading
from pathlib import Path
from typing import Any


class Preferences:
    def __init__(self, path: Path) -> None:
        self.path = path
        self.lock = threading.RLock()
        self.values = {"motion": "full", "appearance": "day"}
        if path.exists():
            self.values.update(json.loads(path.read_text()))

    def get(self) -> dict[str, str]:
        with self.lock:
            return dict(self.values)

    def save(self, data: dict[str, Any]) -> dict[str, str]:
        with self.lock:
            if set(data) - {"motion", "appearance"}:
                raise ValueError("Only application preferences belong in Settings.")
            values = {**self.values, **data}
            if values["motion"] not in ("full", "reduced") or values["appearance"] not in (
                "day",
                "night",
            ):
                raise ValueError("Choose a supported appearance and motion preference.")
            temporary = self.path.with_suffix(".tmp")
            temporary.write_text(json.dumps(values, indent=2))
            temporary.replace(self.path)
            self.values = values
            return self.get()
