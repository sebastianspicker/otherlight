# REPO MAP

## Overview

- Single-page Vite app (TypeScript) that simulates exoplanet–exomoon transits.
- Deterministic simulation core with a stepper API and UI controls/visualization.

## Entry Points

- `index.html`: Vite entry HTML.
- `src/main.ts`: App wiring, UI bindings, render loop.

## Core Simulation

- `src/sim/sim.ts`: Orchestrates the pipeline and exports `stepSystem()` and `prepareSimulation()`.
- `src/sim/*`: Kinematics, dynamics, occulters, additive flux, transit flux, validation.
- `src/photometry/*`: Transit models, limb darkening, phase curves, noise, smearing.
- `src/physics/*`: Kepler solvers, relativity approximations, frames/vectors.

## UI / Rendering

- `src/render/*`: Canvas renderer and light curve plot.
- `src/ui/*`: DOM refs, inputs, slider wiring, enable/disable logic.
- `src/app/*`: Presets, scenario defaults, debug helpers, noise helpers.
- `src/style.css`: Global styles.

## Configuration / Types

- `src/core/*`: Types, units, DOM helpers.
- `src/config/*`: Default configuration values.

## Tests

- `tests/*`: Vitest-based tests.
- `vitest.config.ts`: Test configuration.

## Tooling

- `package.json`: Scripts and dev dependencies.
- `pnpm-lock.yaml`: Lockfile (reproducible installs).
- `eslint.config.js`, `prettier` (via scripts): Lint/format.
- `tsconfig.json`, `tsconfig.test.json`: TypeScript configs.
- `vite.config.ts`: Vite build/dev config.

## Data Flow (High Level)

1. UI reads params and applies preset defaults (`src/app/*`, `src/ui/*`).
2. `prepareSimulation()` preloads optional modules (limb darkening).
3. `stepSystem()` runs kinematics, occulters, transit flux, additive flux.
4. Renderer draws sky-plane visualization and light curve (`src/render/*`).

## Hotspots / Risk Areas

- `src/sim/*`: Core physics pipeline and validation.
- `src/photometry/*`: Limb darkening, transmission, and noise modeling.
- `src/physics/*`: Orbital dynamics and relativity approximations.
