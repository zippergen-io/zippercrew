"""Real worker and streaming CLI processes, with file-controlled fake model calls."""

import copy
import json
import os
import sys
import time
from concurrent.futures import ThreadPoolExecutor

import pytest
from test_transport import eventually

from zippercrew.rooms import Conflict, Run, Runs


@pytest.fixture
def controlled_run(tmp_path, config, monkeypatch):
    cli = tmp_path / "bin" / "codex"
    cli.parent.mkdir()
    cli.write_text(
        f"#!{sys.executable}\n"
        + """import json, os, subprocess, sys, time, uuid
from pathlib import Path
args=sys.argv[1:]
prompt=sys.stdin.read()
role=args[args.index('--model')+1]
root=Path.cwd()
number=len(list(root.glob(role+'.*.started')))+1
key=root/(role+'.'+str(number))
session=args[args.index('resume')+1] if 'resume' in args else uuid.uuid4().hex
child=subprocess.Popen([sys.executable,'-c',
    "import pathlib,sys,time\\np=pathlib.Path(sys.argv[1])\\nwhile True:\\n"
    " p.write_text(str(time.monotonic_ns()))\\n time.sleep(.02)",
    str(key)+'.heartbeat'])
Path(str(key)+'.started').write_text(json.dumps({'args':args,'session':session,
    'prompt':prompt,'pid':os.getpid(),'child':child.pid}))
print(json.dumps({'type':'thread.started','thread_id':session}),flush=True)
try:
    release=Path(str(key)+'.release')
    while not release.exists(): time.sleep(.01)
    report=release.read_text()
    if report=='FAIL': sys.exit(2)
    report=report or ('Implemented the task.' if role=='Implementer' else
        'APPROVE\\nFINDINGS: 0\\nChecks pass.')
    print(json.dumps({'type':'item.completed','item':{'type':'agent_message','text':report}}),flush=True)
    print(json.dumps({'type':'turn.completed'}),flush=True)
finally:
    child.terminate()
    child.wait()
"""
    )
    cli.chmod(0o700)
    monkeypatch.setenv("PATH", str(cli.parent) + os.pathsep + os.environ["PATH"])
    runs = []

    def start(workflow="review", human_mode="brief"):
        settings = copy.deepcopy(config)
        workspace = tmp_path / f"workspace-{len(runs)}"
        workspace.mkdir()
        settings.update(workspace=str(workspace), workflow=workflow, human_mode=human_mode)
        if workflow == "double_review":
            settings["agents"]["Critic"] = dict(settings["agents"]["Reviewer"])
        if workflow == "direct":
            settings["agents"].pop("Reviewer")
        for role, binding in settings["agents"].items():
            binding["model"] = role
        run = Run(tmp_path / "runs" / str(len(runs)), settings, str(len(runs)))
        runs.append(run)
        run.start()
        return run, workspace

    yield start
    for run in runs:
        run.stop()
        if run.thread:
            run.thread.join(timeout=5)


def started(workspace, role, number=1):
    path = workspace / f"{role}.{number}.started"
    eventually(path.exists)
    eventually((workspace / f"{role}.{number}.heartbeat").exists)
    return json.loads(path.read_text())


def release(workspace, role, number=1, report=""):
    (workspace / f"{role}.{number}.release").write_text(report)


def test_pause_drains_call_without_freezing_tools_and_resume_keeps_sessions(controlled_run):
    run, work = controlled_run()
    worker = started(work, "Implementer")
    pid = run.process.pid
    with ThreadPoolExecutor(4) as pool:
        list(pool.map(lambda _: run.pause(), range(4)))
    assert run.snapshot()["status"] == "pausing"
    heartbeat = work / "Implementer.1.heartbeat"
    eventually(heartbeat.exists)
    previous = heartbeat.read_text()
    eventually(lambda: heartbeat.read_text() != previous)
    assert not (work / "Reviewer.1.started").exists()
    release(work, "Implementer")
    eventually(lambda: run.snapshot()["status"] == "paused")
    eventually(lambda: bool(run.waiting_calls))
    assert not run.snapshot()["active_calls"]
    assert not (work / "Reviewer.1.started").exists()
    assert not run.snapshot()["pending"]
    run.resume()
    assert run.process.pid == pid
    reviewer = started(work, "Reviewer")
    assert worker["session"] != reviewer["session"]
    release(work, "Reviewer")
    eventually(lambda: bool(run.snapshot()["pending"]))
    run.respond(run.snapshot()["pending"]["id"], "Another round", "Check zero too.")
    second = started(work, "Implementer", 2)
    assert second["session"] == worker["session"]
    assert "Check zero too." in second["prompt"] and "Checks pass." in second["prompt"]
    events = [json.loads(line) for line in (run.root / "events.jsonl").read_text().splitlines()]
    pause = next(e["id"] for e in events if e["type"] == "room.pausing")
    resume = next(e["id"] for e in events if e["type"] == "room.resumed")
    assert not any(
        e["type"] == "assistant.call_started" and pause < e["id"] < resume for e in events
    )


def test_double_review_drains_both_reviewers_before_pausing(controlled_run):
    run, work = controlled_run("double_review")
    started(work, "Implementer")
    release(work, "Implementer")
    reviewer, critic = started(work, "Reviewer"), started(work, "Critic")
    run.pause()
    release(work, "Reviewer")
    eventually(lambda: len(run.snapshot()["active_calls"]) == 1)
    assert run.snapshot()["status"] == "pausing"
    assert not (work / "Reviewer.2.started").exists()
    release(work, "Critic")
    eventually(lambda: run.snapshot()["status"] == "paused")
    assert not run.snapshot()["pending"]
    assert not (work / "Critic.2.started").exists()
    run.resume()
    assert started(work, "Reviewer", 2)["session"] == reviewer["session"]
    assert started(work, "Critic", 2)["session"] == critic["session"]
    release(work, "Reviewer", 2)
    release(work, "Critic", 2)
    eventually(lambda: bool(run.snapshot()["pending"]))
    assert len(run.snapshot()["pending"]["summary"]["reviewers"]) == 2


def test_review_format_repair_also_waits_for_resume(controlled_run):
    run, work = controlled_run()
    started(work, "Implementer")
    release(work, "Implementer")
    reviewer = started(work, "Reviewer")
    run.pause()
    release(work, "Reviewer", report="**APPROVE**\nFINDINGS: 0\nChecks pass.")
    eventually(lambda: run.snapshot()["status"] == "paused" and bool(run.waiting_calls))
    assert [call["action"] for call in run.waiting_calls.values()] == ["review:format"]
    assert not (work / "Reviewer.2.started").exists()
    run.resume()
    assert started(work, "Reviewer", 2)["session"] == reviewer["session"]
    release(work, "Reviewer", 2, '{"verdict":"APPROVE","findings":0}')
    eventually(lambda: bool(run.snapshot()["pending"]))
    assert run.snapshot()["pending"]["summary"]["recommendation"] == "Ship it"


@pytest.mark.parametrize(
    ("workflow", "ending"),
    [
        (workflow, ending)
        for workflow in ("direct", "review", "double_review")
        for ending in ("human", "completed", "failed")
        # Direct always asks the Human, even in auto mode.
        if (workflow, ending) != ("direct", "completed")
    ],
)
def test_natural_boundary_takes_precedence_over_pause(controlled_run, workflow, ending):
    run, work = controlled_run(workflow, "auto" if ending == "completed" else "brief")
    started(work, "Implementer")
    role, number = "Implementer", 1
    if workflow != "direct":
        release(work, "Implementer")
        started(work, "Reviewer")
        role = "Reviewer"
    if workflow == "double_review":
        started(work, "Critic")
        release(work, "Reviewer")
        release(work, "Critic")
        started(work, "Reviewer", 2)
        started(work, "Critic", 2)
        number = 2
    run.pause()
    if workflow == "double_review":
        release(work, "Critic", 2)
        eventually(lambda: len(run.snapshot()["active_calls"]) == 1)
        assert run.snapshot()["status"] == "pausing"
    release(work, role, number, report="FAIL" if ending == "failed" else "")
    if ending == "human":
        eventually(lambda: bool(run.snapshot()["pending"]))
        assert run.snapshot()["status"] == "running"
        run.respond(run.snapshot()["pending"]["id"], "Done" if workflow == "direct" else "Ship it")
        ending = "completed"
    eventually(lambda: run.snapshot()["status"] == ending)
    assert not run.snapshot()["active_calls"]
    events = [json.loads(line) for line in (run.root / "events.jsonl").read_text().splitlines()]
    assert not any(event["type"] in {"room.paused", "room.resumed"} for event in events)


def test_resume_can_cancel_an_unfinished_pause(controlled_run):
    run, work = controlled_run()
    first = started(work, "Implementer")
    run.pause()
    run.resume()
    assert run.snapshot()["status"] == "running"
    with pytest.raises(Conflict):
        run.resume()
    assert started(work, "Implementer")["pid"] == first["pid"]
    release(work, "Implementer")
    started(work, "Reviewer")
    assert not (work / "Implementer.2.started").exists()


@pytest.mark.parametrize("fully_paused", [False, True])
@pytest.mark.parametrize("shutdown", ["stop", "service_lost"])
def test_stop_and_service_loss_end_pausing_and_paused_runs(controlled_run, fully_paused, shutdown):
    run, work = controlled_run()
    started(work, "Implementer")
    run.pause()
    if fully_paused:
        release(work, "Implementer")
        eventually(lambda: run.snapshot()["status"] == "paused" and bool(run.waiting_calls))
    if shutdown == "stop":
        run.stop()
        assert run.snapshot()["status"] == "stopped"
    else:
        run.process.stdin.close()
        run.process.wait(timeout=5)
        eventually(lambda: run.snapshot()["status"] == "failed")
    assert run.process.poll() is not None
    assert not (work / "Reviewer.1.started").exists()
    heartbeat = work / "Implementer.1.heartbeat"
    eventually(heartbeat.exists)
    time.sleep(0.1)
    stamp = heartbeat.read_text()
    time.sleep(0.1)
    assert heartbeat.read_text() == stamp


@pytest.mark.parametrize("status", ["pausing", "paused"])
def test_restart_records_interrupted_pause_as_stopped(tmp_path, config, status):
    root = tmp_path / "runs" / "interrupted"
    root.mkdir(parents=True)
    (root / "config.json").write_text(json.dumps(config))
    (root / "events.jsonl").write_text(json.dumps({"type": "room." + status, "id": 1}) + "\n")
    restored = Runs(root.parent).get("interrupted").snapshot()
    assert restored["status"] == "stopped"
