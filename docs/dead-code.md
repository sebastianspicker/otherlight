# Export and type discovery

`pnpm deadcode` checks files, dependencies, unresolved references, and unused
exports and types. `pnpm deadcode:report` prints raw Knip JSON, and
`pnpm deadcode:exports` writes `test-results/deadcode-exports.json` and fails on
any unlisted finding or stale allowance.

Discovery roots Browser startup, the chromatic worker, the Vite and Vitest
configurations, all tests, the static demo entry, and the script entrypoints in
`package.json`. Those roots stay explicit even when a Knip plugin calls them
redundant, so discovery never depends on implicit plugin behavior.

The Browser is a private application: nothing outside this repository imports
its TypeScript, and the Apple and Python code share no implementation with it.
An export that no module, test, or script uses is therefore dead. Make it
module-private, drop it from the barrel that re-exports it, or delete it; git
history keeps removed code.

`scripts/deadcode-compatibility.json` is for the rare symbol that is used
through a channel Knip cannot trace, or that must stay for a documented reason.
Each entry names one exact file, symbol, finding kind, and reason; there are no
directory suppressions. Symbols that scripts load through Vite `ssrLoadModule`
strings are an example of an untraceable channel. The current entries keep the
mixed-shape opaque-transit integrator that model
`photometry.transit.opaque-disks` in [the model registry](physics/model-registry.json)
describes, although no runtime path calls it yet.

An allowance added only to make the gate pass defeats the purpose of the gate.
