# Otherlight redesign brief

Prepared 27 September 2026 for the Browser app (`apps/browser/`). The brief is
based on the product documentation, the capability registry, the Browser
templates and controllers, the existing Quiet Observatory stylesheet, the
earlier design exploration kept locally under `output/`, and rendered captures
of the running app at 1440, 1024 and 390 px.

## 1. Product summary

Otherlight is a local-first laboratory for exoplanet transits, exomoons,
detached binaries, photometry and timing. The Browser app runs a teaching
simulation (the "Education" V4 runtime) entirely on the learner's machine. It
pairs that simulation with Guided Labs: lessons that move through
predict → observe → explain phases, record written responses and export a
Markdown report. A separate **Scientific** profile compiles a supported
scenario to a strict V5 contract and runs it on an optional loopback Python
service, or, on the hosted build, replays a checked-in fixture that is clearly
labelled as a replay.

The product's defining promise is honesty about evidence. An Education preview
and a scientific execution result are different kinds of object, and the
interface must never let one pass for the other (`docs/PRODUCT.md`,
`AGENTS.md`).

**Moment of value.** A learner sets a second planet radius (B), presses
Compare, and sees two light curves of different depth next to
`δ ≈ (Rp / R★)²` and the computed geometric depths. Size visibly becomes
signal. Everything in the Education screen should serve that moment.

## 2. Audience

**Primary: the STEM learner**, a bachelor's or master's student in physics or
astronomy (documented in `docs/PRODUCT.md`). They know algebra and basic
mechanics, meet photometric vocabulary here for the first time, and usually
work on a laptop, often in a lab session.

- _Goals:_ see cause and effect, get a number they can check by hand, write an
  explanation that holds up.
- _Anxieties:_ "Did I break it?" after invalid input, not knowing which of
  the many controls matter, being graded by a machine.
- _Distrusts:_ decorative space imagery, unlabelled plots, anything that looks
  like a game rather than a lab.
- _Quality signals:_ figures that look like those in their textbooks and
  papers, correct units and symbols, stable numbers, calm typography.

**Secondary: the educator.** Educators need a layout that survives a projector,
reproducible scenarios, and visible progress through a lab. A projector washes
out dark interfaces and fine grey text, and it rewards high-contrast ink on a
light ground.

**Tertiary: the technical explorer.** Explorers want dense parameter access,
diagnostics and provenance, and they read `V5`, `JD TDB` and `DOP853` without
help. They distrust anything that hides the model's limits.

## 3. Key journeys

1. **Radius experiment (Education, Simulation).** Open → read the question →
   Jump to transit → set B → Compare → read curves and depths → Record
   interpretation → download the report or save the workspace.
2. **Guided Lab.** Choose Guided Labs → pick a lesson → move through phases
   (worked example, prediction, observation, check) → respond in writing →
   Check step → download the lesson report.
3. **Scientific run.** Choose Scientific → check the backend → review the
   validated scope → run the V5 job or read the fixture replay → inspect the
   provenance manifest. Optionally import V6 datasets.
4. **Expert authoring.** Open System parameters → quick sliders or Advanced
   parameters → Apply. Invalid drafts stay visible for correction.
5. **Workspace round trip.** Save and Open a `.otherlight` file.

## 4. Brand traits

| Trait                  | Not                                 |
| ---------------------- | ----------------------------------- |
| Exact                  | pedantic or cold                    |
| Candid about limits    | apologetic or buried in disclaimers |
| Scholarly              | antiquarian or academic-costume     |
| Calm                   | sleepy or grey                      |
| Welcoming to beginners | childish or gamified                |

## 5. Market observations

Closest alternatives: PhET simulations, the UNL Astronomy Education (NAAP)
simulators, NASA's Eyes on Exoplanets, Exoplanet Watch and its tutorials,
Universe Sandbox, and research tooling such as AstroImageJ and
Lightkurve/matplotlib notebooks. (I reasoned from knowledge of these products,
not from a live survey.)

- **Common conventions:** a black starfield background, saturated NASA blues and
  neon accents, glowing planets, rounded "game" controls (PhET), or,
  at the research end, default matplotlib figures and unstyled Tk/Java UIs.
- **Honor:** the plot conventions users already know: flux on y against time on
  x, a unity baseline, dashed versus solid series, and units in axis labels.
  Honor native form controls and familiar disclosure behaviour.
- **Break:** the starfield-and-glow aesthetic. It reads as entertainment, it
  projects badly, and every astronomy product already uses it. Also break the
  grey research-UI default that tells learners nobody designed for them.

## 6. What to keep

- The eclipse mark (a ring plus an occulting disc), redrawn in the new ink.
- The information architecture from the September exploration: question →
  controlled inputs → evidence → interpretation, the Hypothesis / Experiment /
  Interpretation phases, A as the accepted model, and B as the single changed
  variable.
- Every stable DOM id, native control, live region, text equivalent for
  canvases, and profile/mode visibility mechanism.
- The canvas physics rendering of the sky scene (star disk, limb darkening,
  silhouettes), which is real evidence rather than decoration.

## 7. Current weaknesses

- **Generic foundation:** system UI font everywhere, flat dark navy, a pale
  primary button. It is indistinguishable from any dark dashboard.
- **Buried product boundary:** Education/Scientific and Simulation/Guided Labs sit
  inside a "Workspace options" dropdown that overlaps the page. The header says
  "Transit experiment" even in the Scientific profile.
- **Two visual languages:** Education uses open rules, while Scientific uses
  rounded cards, tinted boxes and uppercase eyebrows.
- **The plot looks like a terminal:** dark background, monospaced ticks, grey
  dotted grid, a "Flux (stellar units)" title drawn inside the canvas and again
  in the heading.
- **Weak hierarchy on first load:** the sky view is mostly empty space, the
  light curve shows one sample, and the same warning appears in the figure
  caption and again as a yellow paragraph. The yellow text also carries a
  "asserted.;" punctuation artefact.
- **Inconsistent details:** A reads `150,000` while B reads `200000`. Buttons
  of equal rank have different weights (Start is a link, Jump is outlined, Reset
  is bare). Radius dominates at 42 px while the curve heading is 22 px.
- **Grey-on-dark small text** fails on projectors even where it passes AA on a
  monitor.

## 8. Constraints

- **Stable identifiers and behaviour:** tests, labels and wiring depend on the
  ids in the templates. Visibility runs through `hidden`,
  `data-product-profile`, `data-product-mode`, `data-ui-tier`, and
  `body[data-observatory-phase|system]`.
- **Architecture:** `presentation/render/` may import only `domain/` and
  `render/`, and there is one style entry, `presentation/styles/style.css`.
  Stylelint, Prettier, a 500-line limit per source file, and jscpd duplicate
  detection all apply.
- **CSP:** `font-src 'self'`, `style-src 'self'` in builds, and no third-party
  requests. Fonts must be self-hosted, and there are no inline styles in built
  HTML.
- **Evidence labelling:** Education output and fixture replays are never
  labelled as scientific runs, and every canvas keeps a text equivalent.
- **Accessibility:** WCAG 2.2 AA, keyboard-complete, 200% zoom reflow, reduced
  motion, forced colours, and coarse pointers.
- **No dependencies needed:** the redesign should add none, and fonts ship as
  static assets.

## 9. Assumptions log

| #   | Assumption                                                                                      | Evidence                                                                                       | Confidence |
| --- | ----------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------- |
| A1  | The learner on a laptop is the primary user; the educator on a projector is second.             | `docs/PRODUCT.md` user list; lab-session features (reports, phases); no telemetry.             | Medium     |
| A2  | A light, paper-toned default serves learners and projection better than the current dark field. | Projection physics; textbook/paper figure conventions; the product's "classroom" framing.      | Medium     |
| A3  | Users recognise journal-style figures (framed axes, inward ticks) as "real science".            | Ubiquity of this figure style in astronomy papers (AAS journals, astropy/matplotlib styles).   | High       |
| A4  | A dark mode is still needed for evening study and for users who prefer it.                      | The current product is dark and some users will expect that; OS-level preference is common.    | High       |
| A5  | The sky view should stay a dark "plate" in both themes.                                         | It depicts light against the sky; a limb-darkened star must read as luminous.                  | High       |
| A6  | Showing the profile and mode choices in the header costs nothing important.                     | No code depends on the dropdown; the boundary is a core principle in `docs/PRODUCT.md`.        | High       |
| A7  | Atkinson Hyperlegible Next reads well for long sessions and as UI text at 13–15 px.             | Designed for low-vision legibility (Braille Institute); open-licensed, variable weights.       | Medium     |
| A8  | STIX Two is appropriate for headings, equations and lesson prose.                               | STIX was built by scientific publishers for scientific typesetting; it has math-aware italics. | High       |
| A9  | Most sessions use English only; there is no i18n layer to protect.                              | No localisation files or `lang` switching in the Browser source.                               | High       |

## 10. Design direction

I developed three directions from the domain itself: how transit science is
recorded, printed and taught.

### Direction A — "Plate & Figure" (chosen)

**Concept.** Otherlight as a well-set scientific paper that you can operate.
Astronomy's record has two kinds of evidence: the _photographic plate_ (a sky
picture, dark and luminous) and the _printed figure_ (ink lines on paper, framed
axes, numbered captions). The redesign uses exactly that pair. The sky view is a
dark plate with registration marks. The light curve is a journal figure. Every
other surface is paper, ink and rules, like a methods section. This fits the
audience because students already trust this visual language from textbooks
and papers. It also makes the Education/Scientific distinction feel like an
editorial fact ("what kind of evidence is this?") rather than a UI theme.

- **Typography.** _STIX Two Text_ (variable, roman and italic) for headings,
  figure captions, lesson prose and the depth equation; STIX is the typeface of
  scientific publishing, and its italic is correct for variables (δ, R).
  _Atkinson Hyperlegible Next_ for controls, labels and body UI, for
  legibility at small sizes and on projectors. _Atkinson Hyperlegible Mono_ for
  readouts and serialized evidence, sharing letterforms with the sans. The
  scale is a 1.25 ratio from 15 px: 12 · 13 · 15 · 17 · 20 · 26 · 34 · 44/52
  (display). Tabular lining figures are used for every number.
- **Colour.** Paper `#f3efe6` and ink `#17191b` carry nearly everything. The
  single accent is _blue pencil_ `#1f55b3`, an editor's annotation colour.
  It means "your change": trace B, the selected phase, active edits.
  Trace A is ink, dashed. It is the printed baseline. Caution is ochre
  `#72500a` on a pale wash, fault is oxide red `#9e2a2b`, pass is `#2b6a3e`.
  The plate is `#0c0f13`. Dark mode swaps paper and ink (paper `#131416`, ink
  `#ebe6db`, pencil `#8fb3ff`) and keeps every role.
- **Layout.** A 12-column grid, 1440 px maximum, 40 px outer margin. The
  Education page is set like a paper spread: an 8-column main column holds the
  figures and a 4-column _margin column_ holds the controls, the equation and the
  lesson ("marginalia"). Rules separate sections; there are no cards. Density is
  moderate: learners get generous line height, while expert disclosures are
  tighter. Mobile is its own composition: question → plate → A/B inputs →
  figure → result table → notes, with the phase navigation as a full-width
  three-part stepper.
- **Motion.** Almost none. Colour and border transitions run 160 ms ease-out,
  disclosure markers rotate, and the plot redraw is the only animation. No
  entrances. Reduced motion removes even these.
- **Signature details.** (1) **Journal figures**: the light curve is framed on
  four sides with inward ticks, STIX axis labels (_F_ / _F₀_, _t_ [s]), and a
  numbered caption ("Figure 2. Relative starlight"). (2) **Plate fiducials**: the
  sky canvas carries corner registration marks and an envelope line in mono
  ("PLATE 1 · SKY PLANE · OBSERVER VIEW"). (3) **Running head**: under the
  masthead a ruled line always states what kind of evidence is on screen
  ("Education preview — teaching model with stated limits" or "Scientific
  workspace — validated V5 contract on a loopback service").
- **How it stands apart.** It uses no starfield, glow, or NASA blue, and it
  doesn't read as a dashboard: evidence is set like print.
- **Refuses.** Gradients, glass, glows, drop shadows, pill badges, rounded
  cards (controls get a 3 px radius; sections get none), icon sets, uppercase
  letter-spaced eyebrows everywhere, and any decoration that is not evidence.

### Direction B — "Night Log"

**Concept.** The observing log at the telescope: a red-light-safe dark room,
timestamped log entries, and every action recorded as a line in a running log.
Typography would be a condensed grotesk with a typewriter mono, and the palette
near-black with dim red and amber. Layout would be a single chronological column
with a sticky instrument strip. Its signature details would be a red "night
vision" mode and UT timestamps on every event.
**Why not:** red-on-black fails contrast and projection. It deepens the
starfield convention instead of breaking it, and it casts the learner as an
observer at a telescope, which is not what they do here. It is the most
atmospheric direction and the least fit for the audience.

### Direction C — "Lab Manual"

**Concept.** A university lab handout with numbered procedure steps (1.1,
1.2 …), answer boxes, a hint margin, and graph-paper plots. Typography would be
a slab serif with a sturdy grotesk, and the palette off-white, graphite and
engineering green.
**Why not:** it serves the first-time learner well but talks down to educators
and explorers. Graph paper is kitsch at screen resolution, and the
worksheet frame weakens the Scientific profile, which must feel like research
tooling.

### Choice

**Plate & Figure** best satisfies the brief. It is specific to astronomy (plates
and figures are this field's own artefacts), it serves projection (A2), and it
turns the product's central principle, labelling the kind of evidence, into
the visual system itself. From **Lab Manual** it borrows numbered phases and
marginal hints. The trade-off: a light default departs from the current dark
identity and from the category's expectation of "space". If A2 is wrong,
the complete dark mode (A4) and the always-dark plate (A5) keep the design
coherent, because every role exists in both themes.
