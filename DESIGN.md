# Browser design guide

The Browser supports exploration and teaching. It should make the current
scenario, active profile, warning state, and evidence visible without making
the learner infer hidden state.

## Structure

`apps/browser/src/presentation/` owns DOM templates, controllers, canvas
renderers, and styles. The style entry is
`apps/browser/src/presentation/styles/style.css`. Keep presentation concerns
there; do not place styling, DOM access, or browser event handling in the
domain or application layers.

Use native controls and semantic landmarks first. Canvas output must have a
linked textual summary. Controls, status, and visual output should retain a
logical reading and focus order at narrow widths.

## Interaction rules

- Preserve invalid input text, explain the error, and leave accepted scenario
  state unchanged.
- Announce meaningful state changes, not animation frames.
- Make unavailable scientific actions explicit. A missing loopback capability
  is not a reason to show an Education result as a scientific result.
- Keep controls and labels stable where tests or accessibility wiring depend
  on their identifiers.
- Treat light curves, diagnostics, and screenshots as evidence views. Do not
  imply research calibration beyond the documented model boundary.

## Visual language

Use restrained neutral surfaces for controls and dark canvases for sky or plot
evidence. Prefer system fonts and local assets. Avoid decorative motion that
obscures state changes or continuous redraw work when the simulation is paused
or hidden.
