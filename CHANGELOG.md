# Changelog

All notable changes to this project are documented in this file.

## Unreleased

- Added peer Simulation and Guided Labs navigation, durable URL context, accessible canvas summaries, scientific input validation, reversible history clearing, fatal-error recovery, and an invalidation-driven paused render scheduler.
- Introduced the Classroom Observatory visual system with a light shell, dark scientific plots, responsive controls, and explicit status.
- Made N-body close-encounter diagnostics independent of cache query order by retaining the epoch anchor, selecting only interval-contained cache bases, and carrying path minima forward.
- Kept the Python base and service-only installations importable without scientific extras; the service starts fail-closed and advertises unavailable forward execution when they are absent.
- Aligned Debug Apple builds with the active architecture so macOS, iPhone, and iPad targets consume the same Swift package module slice while Release archives retain their platform contracts.

## [0.1.0] - 2026-04-20

- Replaced the retired worker handoff with an in-thread deterministic reference runtime.
- Added visualization and light-curve render components.
- Improved error handling visibility, including surfacing application startup failures.
- Fixed brightness-patch double counting in the transit integrator.
- Hardened the Kepler solver for high-eccentricity orbits.
