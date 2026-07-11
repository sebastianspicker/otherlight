# Transit Light-Curve Lab Design System

## Overview

Transit Light-Curve Lab uses a Classroom Observatory visual system: a bright, neutral application shell around dark scientific plot surfaces. The interface is a precise working instrument, not a decorative space experience. Flat tonal layers, clear borders, and stable alignment carry hierarchy.

## Color

- `shell`: neutral near-white for the page background.
- `surface`: white for primary working regions.
- `surface-subtle`: cool neutral for toolbars and secondary regions.
- `text`: near-black blue for primary text.
- `text-muted`: dark slate that still meets WCAG AA on shell and surface.
- `border`: cool gray for structural separation.
- `action`: deep teal for primary actions, selected navigation, and focus.
- `signal`: amber for scientific emphasis and warnings, never decoration.
- `success`, `warning`, and `error`: semantic states with text and shape in addition to color.
- `plot`: near-black blue for canvases, with high-contrast white, teal, amber, cyan, and patterned series.

All text/background pairs must meet WCAG 2.2 AA. Focus rings use a 3px teal outline with a light offset. Do not add a theme toggle for the public alpha.

## Typography

Use one system sans stack for headings, controls, labels, and prose. Use the existing system monospace stack for numerical values and compact scientific data only. Body text is at least 15px; labels are at least 13px; canvas annotations are responsive and at least 11–12px. Headings use a fixed product scale, balanced wrapping, and no decorative serif or gradient treatment.

## Shape, Spacing, and Elevation

- Spacing scale: 4, 8, 12, 16, 24, and 32px.
- Radius scale: 4px for compact data surfaces, 6px for controls, 10px for major regions, 12px maximum for dialogs.
- Borders establish hierarchy. Shadows are reserved for dialogs and sticky separation and use no more than 8px blur.
- Interactive controls are at least 36px high and become at least 44px on coarse pointers.

## Components

### Product header and navigation

The compact header contains the product name, a short purpose line, and peer navigation for Simulation and Guided Labs. Selected state uses color, border, and `aria-current`; it is not expressed by color alone.

### Context and runtime toolbars

Context selection and runtime controls appear before visualization in DOM and focus order. Toolbars may wrap but must not reorder at narrow widths. Runtime status is persistent and adjacent to the controls it describes.

### Forms

Every field has a visible label, optional unit, help or constraint text where needed, and a specific inline error. Form submission retains invalid text, marks `aria-invalid`, summarizes errors, focuses the first invalid field, and leaves the scientific model unchanged.

### Figures and data summaries

Each canvas is contained in a semantic figure with a heading, caption, and linked textual snapshot. Summaries describe scene geometry, visible events, plot ranges, series, markers, O-C statistics, and warnings. They update only for meaningful state changes. Principal data can be exported as CSV.

### Guided Lab phase

Show one current phase with progress, prompt, response, evidence, result, and next action. Unavailable sections are hidden. Explicit phase navigation moves focus to the phase heading; check results produce one concise announcement.

### Status and recovery

Use persistent status regions for neutral or busy state and `role="alert"` for actionable failures. Error surfaces explain what failed, what was preserved, and the next available action. Disable only affected controls.

### Dialogs

Use native `<dialog>` only for consequential unapplied-change loss. Actions are “Keep editing” and “Discard edits and load…”.

## Layout

The shell order is product header, mode navigation, context selector, runtime toolbar, visualization workspace, mode task panel, then Essential or Advanced parameters. Desktop uses a visualization area with a contextual right rail. Narrow layouts retain DOM order and stack the contextual panel immediately after the runtime toolbar. Plots use aspect ratio and bounded minimum heights rather than viewport-height clamps.

## Motion

Motion communicates state only and lasts 150–200ms with an ease-out curve. There are no page-load sequences or decorative loops. `prefers-reduced-motion` removes nonessential transitions.

## Content

Use user-task terminology: “Guided Labs,” “Essential,” “Advanced,” “Calculation mode,” “Apply parameters,” “Reset time,” “Jump to event,” and “Compare scenarios.” State units and scientific constraints next to the relevant value. Empty states teach the next action.

## Avoid

Gradient text, glass blur, broad shadows, nested cards, custom scrollbars, decorative space backgrounds, repeated entrance animations, raw implementation IDs, vague actions, tiny uppercase legends, pill treatment on every readout, and stacked unavailable-state placeholders.
