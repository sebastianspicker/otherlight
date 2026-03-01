# Documentation Index

This folder contains architecture, physics, runtime, and operations documentation for the simulation.

## Reading paths

- New contributor: start with `../README.md`, then `RUNBOOK.md`, then `params.md`
- Physics deep dive: `physics/overview.md` -> `physics/full-derivation.md`
- CI and release checks: `ci.md`, `validation.md`
- Didactics flow: `didactics/curriculum-v3.md`

## Map

```mermaid
flowchart LR
  Root["README.md"] --> Params["params.md"]
  Root --> Runbook["RUNBOOK.md"]
  Root --> Validation["validation.md"]
  Root --> CI["ci.md"]
  Root --> Physics["physics/overview.md"]
  Physics --> Derivation["physics/full-derivation.md"]
  Physics --> NBody["physics/nbody.md"]
  Physics --> Relativity["physics/relativity.md"]
  Physics --> Photometry["physics/photometry.md"]
  Root --> Didactics["didactics/curriculum-v3.md"]
```

Ephemeral local inspection notes should stay outside the maintained docs set (see `.gitignore` patterns).
