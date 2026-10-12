# mypy: ignore-errors
"""Independent reviews, one exchange, then one human decision.

ZipperGen projects this choreography onto separate participant threads. Both
initial reviews can run concurrently; exchanging their reports is the barrier
before either response starts. Only the Worker has write access.
"""

from zippergen import Lifeline, assistant, human, pure, workflow

from zippercrew.decisions import double_review_summary, review_fields

Human = Lifeline("Human")
Implementer = Lifeline("Implementer")
Reviewer = Lifeline("Reviewer")
Critic = Lifeline("Critic")


@assistant(
    instructions=(
        "Complete the human's task in the repository. Make focused changes and verify them. "
        "Follow supplied guidance, including both reviewers' findings and any human note. "
        "Treat contested findings as claims to check against evidence, not votes. "
        "Return a concise summary of the result, checks performed, and unresolved limitations."
    ),
    access="write",
    external_tools="none",
    shell="enabled",
    workspace="/configured/by/the/room",
)
def implement(task: str, guidance: str) -> str: ...


REVIEW_FORMAT = (
    "Return APPROVE or REVISE on line 1, FINDINGS: <nonnegative integer> on line 2, "
    "and a short plain-language reason on line 3, followed by your full findings. "
    "Cite concrete evidence: requirements, file locations, tests, or reproducible examples. "
    "Distinguish blockers from suggestions and verified results from untested concerns. "
    "Never invent defects, claim unperformed checks, or approve solely to reach agreement. "
    "You may approve or request revision regardless of the other reviewer's position. "
)
DELIVERY = (
    "You are the delivery reviewer. Independently assess whether the result meets the "
    "human's actual request, is useful, and stays appropriately simple and in scope. "
    "Challenge unnecessary complexity and objections that are not genuine blockers. "
    "Do not edit repository files. "
)
CRITICAL = (
    "You are the critical reviewer. Independently examine correctness, assumptions, "
    "edge cases, regressions, security when relevant, and unsupported claims. "
    "Actively seek counterexamples without manufacturing objections. "
    "Do not edit repository files. "
)
RESPONSE = (
    "This is the single exchange of findings. Compare your initial assessment with "
    "the peer's independent report and verify disputed claims against evidence. "
    "Keep, revise, or withdraw your findings explicitly. After the required header, "
    "group your response into Supported findings, Unresolved disagreements, and "
    "Withdrawn findings, omitting empty groups. Do not force consensus or repeat "
    "a disproven objection. Your final verdict is your own. "
)


@assistant(
    instructions=DELIVERY + REVIEW_FORMAT,
    access="read-only",
    external_tools="none",
    shell="enabled",
    workspace="/configured/by/the/room",
)
def review_delivery(task: str, proposal: str) -> str: ...


@assistant(
    instructions=CRITICAL + REVIEW_FORMAT,
    access="read-only",
    external_tools="none",
    shell="enabled",
    workspace="/configured/by/the/room",
)
def review_critical(task: str, proposal: str) -> str: ...


@assistant(
    instructions=DELIVERY + RESPONSE + REVIEW_FORMAT,
    access="read-only",
    external_tools="none",
    shell="enabled",
    workspace="/configured/by/the/room",
)
def respond_delivery(task: str, proposal: str, own_review: str, peer_review: str) -> str: ...


@assistant(
    instructions=CRITICAL + RESPONSE + REVIEW_FORMAT,
    access="read-only",
    external_tools="none",
    shell="enabled",
    workspace="/configured/by/the/room",
)
def respond_critical(task: str, proposal: str, own_review: str, peer_review: str) -> str: ...


@human(
    kind="select",
    context="{briefing}",
    instruction=(
        "Keep the result, request another round, or end this run. Files remain in the repository."
    ),
    prefill="Ship it\nAnother round\nAbandon",
    outputs=["verdict: str"],
)
def judge_turn(briefing: str, rounds: int, max_rounds: int): ...


@human(
    kind="input",
    instruction="Optional note. Both full reviews are already included.",
    outputs=["note: str"],
)
def ask_note(): ...


@pure
def review_header(critique: str) -> str:
    fields = review_fields(critique)
    verdict = fields["verdict"] or "REVISE"
    count = fields["findings"]
    return f"{verdict}|{count if count is not None else '?'}|{fields['reason']}"


@pure
def combine_reviews(
    proposal: str, delivery: str, critical: str, delivery_final: str, critical_final: str
) -> str:
    summary = double_review_summary(proposal, delivery_final, critical_final)
    verdict = "APPROVE" if summary["recommendation"] == "Ship it" else "REVISE"
    return (
        f"{verdict}\nFINDINGS: ?\n{summary['reason']}\n\n"
        f"## Delivery reviewer · initial\n{delivery}\n\n"
        f"## Critical reviewer · initial\n{critical}\n\n"
        f"## Delivery reviewer · after exchange\n{delivery_final}\n\n"
        f"## Critical reviewer · after exchange\n{critical_final}"
    )


@pure
def briefing(proposal: str, critique: str, detail: str) -> str:
    if detail == "full":
        return f"Worker:\n{proposal}\n\n{critique}"
    return critique.split("\n\n", 1)[0]


@pure
def asks_the_human(detail: str) -> bool:
    return detail != "auto"


@pure
def verdict_from_review(critique: str) -> str:
    return "Ship it" if critique.startswith("APPROVE\n") else "Another round"


@pure
def no_guidance() -> str:
    return "Follow the task as written."


@pure
def amend_task(task: str, note: str) -> str:
    """Keep human scope changes visible to every participant on later rounds."""
    if not note.strip():
        return task
    return (
        f"{task}\n\nHuman amendment (takes precedence over earlier requirements "
        f"where they conflict):\n{note.strip()}"
    )


@pure
def no_note() -> str:
    return ""


@pure
def guidance_from_review(critique: str, note: str) -> str:
    guidance = (
        f"Both independent reviews and their exchange follow. Address "
        f"supported findings; verify unresolved disagreements.\n\n{critique}"
    )
    return guidance + (f"\n\nThe human adds:\n{note.strip()}" if note.strip() else "")


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
def outcome(verdict: str, proposal: str, critique: str, rounds: int) -> str:
    ending = (
        "Shipped"
        if verdict == "Ship it"
        else "Abandoned"
        if verdict == "Abandon"
        else "Round limit reached"
    )
    # This combined count is deliberately unknown because findings may overlap.
    # Keep that protocol header in the trace, not in the human-facing outcome.
    critique = critique.replace("\nFINDINGS: ?\n", "\n", 1)
    return (
        f"{ending} after {rounds} round(s). Files remain in the "
        f"repository.\n\n{proposal}\n\n{critique}"
    )


@workflow
def double_review(task: str @ Human, max_rounds: int @ Human, detail: str @ Human) -> str:
    Human(task) >> Implementer(task)
    Human(task) >> Reviewer(task)
    Human(task) >> Critic(task)
    with Human:
        guidance = no_guidance()
        rounds = first_round()
        ask = asks_the_human(detail)
    Human(guidance) >> Implementer(guidance)
    with Implementer:
        proposal = implement(task, guidance)
    Implementer(proposal) >> Reviewer(proposal)
    Implementer(proposal) >> Critic(proposal)
    Implementer(proposal) >> Human(proposal)
    with Reviewer:
        delivery = review_delivery(task, proposal)
    with Critic:
        critical = review_critical(task, proposal)
    Reviewer(delivery) >> Critic(delivery)
    Critic(critical) >> Reviewer(critical)
    with Reviewer:
        delivery_final = respond_delivery(task, proposal, delivery, critical)
    with Critic:
        critical_final = respond_critical(task, proposal, critical, delivery)
    Reviewer(delivery, delivery_final) >> Human(delivery, delivery_final)
    Critic(critical, critical_final) >> Human(critical, critical_final)
    with Human:
        critique = combine_reviews(proposal, delivery, critical, delivery_final, critical_final)
        brief = briefing(proposal, critique, detail)
    if ask @ Human:
        with Human:
            verdict = judge_turn(brief, rounds, max_rounds)
            again = keep_going(verdict, rounds, max_rounds)
        if again @ Human:
            with Human:
                note = ask_note()
        else:
            with Human:
                note = no_note()
    else:
        with Human:
            verdict = verdict_from_review(critique)
            again = keep_going(verdict, rounds, max_rounds)
            note = no_note()
    with Human:
        guidance = guidance_from_review(critique, note)

    while again @ Human:
        with Human:
            rounds = next_round(rounds)
            task = amend_task(task, note)
        Human(task, guidance) >> Implementer(task, guidance)
        Human(task) >> Reviewer(task)
        Human(task) >> Critic(task)
        with Implementer:
            proposal = implement(task, guidance)
        Implementer(proposal) >> Reviewer(proposal)
        Implementer(proposal) >> Critic(proposal)
        Implementer(proposal) >> Human(proposal)
        with Reviewer:
            delivery = review_delivery(task, proposal)
        with Critic:
            critical = review_critical(task, proposal)
        Reviewer(delivery) >> Critic(delivery)
        Critic(critical) >> Reviewer(critical)
        with Reviewer:
            delivery_final = respond_delivery(task, proposal, delivery, critical)
        with Critic:
            critical_final = respond_critical(task, proposal, critical, delivery)
        Reviewer(delivery, delivery_final) >> Human(delivery, delivery_final)
        Critic(critical, critical_final) >> Human(critical, critical_final)
        with Human:
            critique = combine_reviews(proposal, delivery, critical, delivery_final, critical_final)
            brief = briefing(proposal, critique, detail)
        if ask @ Human:
            with Human:
                verdict = judge_turn(brief, rounds, max_rounds)
                again = keep_going(verdict, rounds, max_rounds)
            if again @ Human:
                with Human:
                    note = ask_note()
            else:
                with Human:
                    note = no_note()
        else:
            with Human:
                verdict = verdict_from_review(critique)
                again = keep_going(verdict, rounds, max_rounds)
                note = no_note()
        with Human:
            guidance = guidance_from_review(critique, note)

    with Human:
        result = outcome(verdict, proposal, critique, rounds)
    return result @ Human
