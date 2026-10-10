"""Room formations and their required participants. Old rooms use Review."""

from typing import Any

WORKFLOWS: dict[str, dict[str, Any]] = {
    "direct": {
        "name": "Direct",
        "description": "One worker handles the task and returns the result to you.",
        "roles": ["Implementer"],
        "explanation": (
            "The Worker completes your task, then you decide whether to keep "
            "the result or request another round."
        ),
    },
    "review": {
        "name": "Review",
        "description": "Work is checked by a reviewer before coming back to you.",
        "roles": ["Implementer", "Reviewer"],
        "explanation": (
            "The Worker completes your task. An independent, read-only "
            "Reviewer checks it before you decide. Their full feedback follows "
            "any next round."
        ),
    },
    "double_review": {
        "name": "Double review",
        "description": (
            "Delivery checks scope and usefulness; Critical checks correctness "
            "and risks. They review independently, compare once, then you "
            "decide."
        ),
        "roles": ["Implementer", "Reviewer", "Critic"],
        "explanation": (
            "Both reviewers examine the same result independently, then each "
            "responds once to the other’s findings. Your decision uses both "
            "final assessments. Both reviewers are read-only and may disagree."
        ),
        "role_descriptions": {
            "Implementer": (
                "Makes the changes and verifies the result. Receives both full "
                "reviews when you request another round."
            ),
            "Reviewer": (
                "Delivery reviewer: does the result meet your request, stay in "
                "scope, and avoid unnecessary complexity? Distinguishes blockers "
                "from optional improvements."
            ),
            "Critic": (
                "Critical reviewer: what could be incorrect, fragile, or "
                "unsupported? Checks assumptions, edge cases, and evidence without "
                "inventing objections."
            ),
        },
    },
}


def workflow_id(config: dict[str, Any]) -> str:
    value = config.get("workflow", "review")
    if not isinstance(value, str) or value not in WORKFLOWS:
        raise ValueError("Choose Direct, Review, or Double review.")
    return value


def agent_roles(config: dict[str, Any]) -> list[str]:
    return list(WORKFLOWS[workflow_id(config)]["roles"])
