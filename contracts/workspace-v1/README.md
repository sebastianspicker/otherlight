# Otherlight workspace contract

`workspace.schema.json` defines the cross-platform `.otherlight` document.
Importers also accept the legacy `.transitlab` extension with the same
`workspace-v1` JSON payload.
The document stores reproducible, accepted state only. It intentionally omits
draft input text, playback time, plot and O-C histories, undo state, stored
results, artifacts, and runtime tasks.

Writers emit `workspace-v1`. Readers reject unknown versions without mutating
the active session. Scenario state uses the canonical Education V4 envelope so
the browser and native app restore the same accepted model.
