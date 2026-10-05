# Grounded room + designed personas

Art-direction study, 2026-10-05. These concept images are preserved as approved
references. The direction is now integrated through separate
[production assets](../README.md); these study PNGs are not sprite atlases.

Open the [review page](index.html) directly in a browser. It works offline and
includes comparisons with the production room and yesterday's human-cast study.

## Deliverables

1. [Environment only](environment.png): a grounded Corner Café, with two
   single-person workstations, a shared foreground table, a coffee counter,
   daylight and a claret task-board recess.
2. [Persona concept sheet](personas.png): Human / Implementer / Reviewer from
   left to right; neutral poses above, characteristic role poses below.
3. [Combined target](combined.png): the same room inhabited by the designed cast.
4. [Silhouette study](silhouettes.png): the same six pose concepts with interior
   detail and role colors removed.

## Art direction

The room is the grounded stage. Its architecture and furniture retain believable
proportions; material detail is quieter than the cast. Oak, mineral flooring,
charcoal structure and the claret board recess provide warmth and recognizable
spatial landmarks. Upper-left daylight supplies a common lighting direction.
The desk count, walking space and prop density were reduced after the first pass.

The cast deliberately uses a more stylized visual language: larger heads, hands
and feet, simpler anatomy, strong accent colors and expressive poses. AI roles
are visibly non-human. Their shells have a shared material family without using
the same body or head design.

| Role | Silhouette and identity | Characteristic pose |
| --- | --- | --- |
| Human | Indigo curl mass, broad plum cuffs, relaxed adult body and substantial shoes | Phone plus a calm open-hand decision gesture |
| Implementer | Swept wedge head, bent antenna, coral side hubs, compact springy body and split feet | Forward typing lean, lifted heel, eager expression |
| Reviewer | Shield/lantern head, flat brow and side fins, long neck, narrow teal body and wedge feet | Raised tablet, paused stylus, analytical head tilt |

Human remains recognizably human and part of the cast. The robots should express
personality through posture and visor eyes; they do not need realistic facial
anatomy, detailed armor or decorative mechanical parts.

The sheet normalizes display sizes for comparison; it is not a model-scale chart
or sprite atlas. The combined scene demonstrates intended relative presence:
compact Implementer at the left desk, upright Reviewer on the right, Human near
the shared table. It depicts an illustrative implementing/waiting arrangement,
not a new runtime state or a process change.

## Evaluation

* **Environment:** the reduced desk count and quiet floor keep the space readable.
  Architecture and furniture remain grounded. It is still the most render-like
  part of the study; future authored assets should simplify the fine leaf-shadow
  pattern and wood grain rather than adding photographic detail.
* **Personas:** both AI roles read as designed companions rather than office
  workers. The Human's proportions are more stylized than yesterday's long-legged
  human concepts, while retaining adult posture and expression.
* **Robot appeal:** the Implementer's energetic shape and expressive visor make
  a promising companion; the Reviewer's slower, sharper design provides a foil.
  Keep the Reviewer's eyelids inquisitive rather than bored or dismissive.
* **Silhouettes:** the neutral and role-pose outlines remain distinguishable without
  color: hair/cuffs, wedge/antenna, and shield/long neck. This is a generated art
  study, not pixel-exact masking or proof for all future animation angles.
* **Contrast/cohesion:** common light direction, grounded feet, chair/desk overlap
  and contact shadows integrate the more stylized cast. Stronger role accents
  stand apart from the quieter room without separate studio glows.
* **Identity/modernity:** the biggest gain is the cast. The former three-office-
  people arrangement is now a human lead and two visibly different agent personas.
  The comparison page keeps both the production frame and prior 3D study available
  to judge this change directly.

This study established the approved art target. Production integration retains
these identities and verifies character/station pairs at actual scene scale and
across the existing runtime poses. See the production asset notes for the shipped files.

## Production constraints to retain if selected

* Preserve distinctive head profiles and body proportions across poses; never
  reduce role identity to shell color alone.
* Use one perspective and upper-left key-light convention for environment,
  furniture and character assets. Separate cast/contact shadows from sprites.
* Keep monitor height and desk placement from hiding eyes, hands or role props.
  The compact Implementer needs a supported seated pose, not floating feet.
* Keep persona materials simpler than room materials. No realistic skin pores,
  fabric weave, robot greebles, infant proportions or franchise-derived details.
* Preserve the existing Phaser and semantic-event boundary. Art poses will map
  onto existing states; artwork must not introduce new orchestration behavior.

## Provenance

Created with the built-in image-generation tool; [full prompt record](prompts.md).
The neutral sheet and combined target were reviewed after the initial studies.
Only the four final concept PNGs are stored here; earlier generation drafts are
not production assets. No external character/franchise imagery was supplied.
