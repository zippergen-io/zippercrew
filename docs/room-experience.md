# The room is the application

The first frame is a café: two open workstations facing a shared brief, with the
Human at a round table in front. A window, plants, espresso counter, wood desks,
and a woven rug give the room a consistent, quiet visual identity. All graphics
are inline SVG and CSS; there are no downloaded assets or animation libraries.

Implementer uses terracotta (`#b86d50`), Reviewer sage (`#537d6c`), and Human
violet (`#82729d`). Names, access labels, and written states supplement color.
The same identities appear on clothing, role labels, process steps, message
paths, and transcript entries. Empty agent stations show an invitation to bind
a profile; binding reveals the participant without changing the scene.

Clicking a participant opens a side inspector. Before starting it configures
profiles, role instructions, or Human involvement. During execution it shows
state, round, saved assistant settings, workspace, and completed turns. The
shared board opens a normal path input and substantial task textarea. The
workspace toolbar and task dock offer equivalent, accessible controls. Settings
and room history are secondary inspectors. On narrow screens inspectors sit
below the scene. SVG controls support Enter/Space and visible keyboard focus.

Start working uses the existing room API. The same SVG nodes remain mounted
through both rounds and terminal outcomes. A fresh Human request opens the
Human inspector automatically; inspecting another agent never loses it. The
Your decision button returns to that pending request. Another round and optional
guidance remain separate upstream requests. Full trace downloads remain in
the inspector footer.

| State | Authoritative source | Visual response |
| --- | --- | --- |
| Setting up / ready | Local draft: bound profiles, workspace, task, round limit | Empty seats become occupied; Start becomes available |
| Working | Runtime assistant `act_start` for Implementer | Typing, screen activity, work label |
| Reviewing | Runtime assistant `act_start` for Reviewer | Reading movement, annotation pencil, review label |
| Waiting | Completed action / runtime lifecycle | Participant leans back with coffee |
| Needs human | Pending upstream Human request | Human sits forward; a gentle YOUR TURN indicator and decision inspector appear |
| Completed | Upstream process returned | Relaxed participants, completed labels, actual final outcome |
| Failed / stopped | Runtime failure / service stop event | Muted participant, explicit label and error/outcome |
| Message | Numbered runtime `send` event | Sender-colored route and traveling envelope between role positions |

Animation durations only control visual interpolation; they never determine
participant state. Message IDs prevent duplicate animations. Opening history or
reloading a pending room renders existing messages without replaying transfers.
Reduced-motion preference disables movement and places a static envelope at its
destination. The full trace remains authoritative even when rapid messages are
coalesced into the latest snapshot and only the latest transfer is animated.

`PROCESS` in `scene.js` describes the current process's roles, positions, access
labels, communication links, and compact sequence. The illustration generates
stations from those roles; `paintScene` consumes bindings and runtime states.
This is a small presentation boundary for future layouts, not a workflow engine
or a generic editor. All communication decisions remain in ZipperGen.
