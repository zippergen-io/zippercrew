"""Room formations and their required participants. Old rooms use Review."""

from typing import Any

WORKFLOWS = {
    "direct": {
        "name": "Direct",
        "description": "One worker handles the task and returns the result to you.",
        "roles": ["Implementer"],
    },
    "review": {
        "name": "Review",
        "description": "Work is checked by a reviewer before coming back to you.",
        "roles": ["Implementer", "Reviewer"],
    },
}


def workflow_id(config: dict[str, Any]) -> str:
    value = config.get("workflow", "review")
    if not isinstance(value, str) or value not in WORKFLOWS:
        raise ValueError("Choose Direct or Review.")
    return value


def agent_roles(config: dict[str, Any]) -> list[str]:
    return list(WORKFLOWS[workflow_id(config)]["roles"])
