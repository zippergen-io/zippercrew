# Pair Programming

The semantic source is the sibling ZipperGen pair-programming example. Human
sends the task to Implementer and Reviewer. Implementer edits the selected
workspace and sends a proposal to Reviewer. Reviewer inspects that workspace
with read-only capabilities and returns APPROVE/REVISE plus findings.

Full and brief modes ask Human for Ship it, Another round, or Abandon. If
another round can run, Human may add a note. Automatic mode uses the review
header. Every continuing round passes the full review and optional note to the
same Implementer session. The independent Reviewer session also persists.
The process returns the final outcome after shipping, abandonment, or the round
limit. Abandon leaves edits in the working tree. Ship it ends the process; it
does not commit, push, deploy, or merge.

The browser is a complete human endpoint for local runs. Its room states follow
actual runtime events. No activity state is inferred from elapsed time or CLI
silence. Crew bindings cannot broaden the Reviewer's access.

## Living-room presentation contract

Lifelines become participants; local actions become participant behaviour;
messages become visible handoffs; waiting permits ambient life; enabled Human
actions become requests for attention. This is presentation, never orchestration.

The Room distinguishes local activity from protocol communication. Local activity
is shown through participant animation and short activity bubbles. Every visible
protocol handoff corresponds to a real ZipperGen message and is represented as a
message object moving between participants. Runtime send and receive are distinct;
cosmetic arrival never manufactures a receipt. Telegram is another Human delivery
surface where supported, not another protocol participant.

Ambient actions remain separate from semantic state and immediately yield to work
or Human attention. They are infrequent, role-specific and disabled by reduced
motion. Activity bubbles summarize only observable events, never hidden reasoning
or fabricated thoughts. No output means no new bubble, not a semantic idle state.
The trace remains the complete source of truth; the Room is a faithful,
intentionally simplified visualization. See [scene notes](room-experience.md) for
current observability limits and deterministic presentation tests.
