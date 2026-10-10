# mypy: ignore-errors
"""Human → Worker → Human, parsed by ZipperGen as its workflow DSL."""

from zippergen import Lifeline, assistant, human, pure, workflow

Human = Lifeline("Human")
Implementer = Lifeline("Implementer")


@assistant(
    instructions=(
        "Complete the human's task in the repository. Apply the supplied guidance. "
        "Make focused changes and verify them. Return a concise summary of the result, "
        "the checks performed, and any unresolved limitations."
    ),
    access="write",
    external_tools="none",
    shell="enabled",
    workspace="/configured/by/the/room",
)
def implement(task: str, guidance: str) -> str: ...


@human(
    kind="select",
    context="{proposal}",
    instruction=(
        "Keep the result, ask for another round, or end this run. Files stay in the repository."
    ),
    prefill="Done\nAnother round\nAbandon",
    outputs=["verdict: str"],
)
def judge_turn(proposal: str): ...


@human(kind="input", instruction="What should the worker do next?", outputs=["note: str"])
def ask_note(): ...


@pure
def no_guidance() -> str:
    return ""


@pure
def next_guidance(note: str) -> str:
    return (
        note.strip()
        or "The human requested another attempt without further guidance. "
        "Recheck the task and improve the result where needed."
    )


@pure
def first_round() -> int:
    return 1


@pure
def next_round(rounds: int) -> int:
    return rounds + 1


@pure
def keep_going(verdict: str, rounds: int, max_rounds: int) -> bool:
    return verdict == "Another round" and rounds < max_rounds


@pure
def outcome(verdict: str, proposal: str, rounds: int) -> str:
    ending = (
        "Completed"
        if verdict == "Done"
        else "Abandoned"
        if verdict == "Abandon"
        else "Round limit reached"
    )
    return f"{ending} after {rounds} round(s). Files remain in the repository.\n\n{proposal}"


@workflow
def direct(task: str @ Human, max_rounds: int @ Human, detail: str @ Human) -> str:
    Human(task) >> Implementer(task)
    with Human:
        guidance = no_guidance()
        rounds = first_round()
    Human(guidance) >> Implementer(guidance)
    with Implementer:
        proposal = implement(task, guidance)
    Implementer(proposal) >> Human(proposal)
    with Human:
        verdict = judge_turn(proposal)
        again = keep_going(verdict, rounds, max_rounds)
    while again @ Human:
        with Human:
            note = ask_note()
            guidance = next_guidance(note)
            rounds = next_round(rounds)
        Human(guidance) >> Implementer(guidance)
        with Implementer:
            proposal = implement(task, guidance)
        Implementer(proposal) >> Human(proposal)
        with Human:
            verdict = judge_turn(proposal)
            again = keep_going(verdict, rounds, max_rounds)
    with Human:
        result = outcome(verdict, proposal, rounds)
    return result @ Human
