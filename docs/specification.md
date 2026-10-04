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
