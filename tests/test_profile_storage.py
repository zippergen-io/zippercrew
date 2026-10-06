"""CLI defaults must keep assistant profiles outside source repositories."""

import os
import select
import subprocess
import sys
from pathlib import Path
from urllib.parse import urlsplit

import pytest
from conftest import request

from zippercrew.server import default_profile_directory


def test_default_profile_directory_is_user_owned(monkeypatch):
    monkeypatch.delenv("XDG_CONFIG_HOME", raising=False)
    assert default_profile_directory() == (Path.home() / ".config/zippercrew").resolve()


@pytest.mark.parametrize("explicit_project", [False, True])
def test_cli_saves_profiles_outside_launch_directory(tmp_path, explicit_project):
    launch = tmp_path / "source-repository"
    launch.mkdir()
    config_root = tmp_path / "user-config"
    selected = config_root / "zippercrew"
    command = [sys.executable, "-m", "zippercrew.server", "--demo", "--port", "0"]
    if explicit_project:
        selected = tmp_path / "existing-zippergen-project"
        selected.mkdir()
        command.extend(["--project", str(selected)])
    process = subprocess.Popen(
        command,
        cwd=launch,
        env={**os.environ, "XDG_CONFIG_HOME": str(config_root)},
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
    )
    try:
        assert select.select([process.stdout], [], [], 10)[0], "Server did not start"
        startup = process.stdout.readline()
        assert "http://127.0.0.1:" in startup, startup
        advertised = urlsplit(startup.split(" — ", 1)[1].strip())
        assert advertised.path == "/office/"
        base = f"{advertised.scheme}://{advertised.netloc}"
        status, bootstrap = request(base, "/api/bootstrap")
        assert status == 200 and bootstrap["project"] == str(selected.resolve())
        status, _ = request(
            base,
            "/api/profiles",
            {
                "project": bootstrap["project"],
                "name": "my-codex",
                "backend": "codex",
            },
        )
        assert status == 201
        assert "my-codex" in (selected / "zippergen.toml").read_text()
        assert not (launch / "zippergen.toml").exists()
        if explicit_project:
            assert not (config_root / "zippercrew").exists()
    finally:
        process.terminate()
        process.wait(timeout=5)
        process.stdout.close()
        process.stderr.close()
