# Product

## Who Otherlight is for

Otherlight is built for bachelor- and master-level STEM learners, for the
educators who teach them, and for technical explorers who want to poke at the
models directly.

- **Learners** need to see cause and effect, read evidence without a decoder
  ring, pick up the vocabulary as they go, and recover quickly from a bad input.
- **Educators** need scenarios they can reproduce, layouts that survive a
  projector, visible progress through a lab, and exports they can trust.
- **Technical explorers** need deterministic modes, dense parameter access,
  diagnostics, provenance, and an honest statement of each model's limits.

## What it is for

Otherlight is a local-first workspace for learning about exoplanet transits,
exomoons, detached binaries, photometry, and timing. The Browser is the primary
product: it pairs direct Education simulation with Guided Labs, and it can call
a separate loopback service for the scientific contracts it explicitly
supports.

The product succeeds when someone can understand and reproduce a state, tell a
teaching preview apart from a scientific execution result, judge whether their
inputs and results are valid, and finish the core workflow without relying on
sight, color, or a pointing device.

## Personality

Precise, calm, and instructive. Otherlight treats learners, educators, and
technical explorers as peers. It should feel like a trustworthy classroom
observatory: welcoming enough for a first lab, exact enough for close
inspection, and quiet enough that the evidence stays the main event.

## What it must not become

Otherlight should never look like a decorative space-themed landing page, a
generic glass dashboard, or a framework-demo card grid. Specifically, avoid:

- ornamental animation, gradient text, and broad drop shadows;
- excessive pill-shaped readouts and ambiguous model language;
- custom controls that throw away familiar platform behavior;
- scientific plots whose meaning exists only as pixels.

## Design principles

1. **Scientific scope is explicit.** Education previews, fixture replays, and
   scientific runs are named and presented as different kinds of evidence.
2. **Simulation and Guided Labs are peers.** Neither is a decorative appendix to
   the other.
3. **State stays visible and recoverable.** Current state, pending changes,
   unavailable capabilities, busy work, and failures are always reachable.
4. **Charts can be primary evidence, but never the only evidence.** Every plot
   has a textual or structural equivalent.
5. **Guidance supports learners without hiding the expert controls** or the
   provenance behind a result.
6. **Local-first means user-controlled persistence.** No implicit accounts,
   synchronization, network access, or caches.

## Accessibility and inclusion

Production interfaces target WCAG 2.2 AA. Core workflows support keyboard-only
use, visible focus, 200% zoom and reflow, reduced motion, coarse pointers,
Dynamic Type on Apple platforms, color-independent plot encodings, and nonvisual
equivalents for canvas output. Status changes, validation, lesson results, and
recovery actions are announced without flooding a live region.
