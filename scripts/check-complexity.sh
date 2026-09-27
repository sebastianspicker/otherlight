#!/usr/bin/env bash
# Runs the repository complexity gate (lizard) over every authored source root.

set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

uv run --project services/science --locked --extra dev lizard -w -C 12 -T nloc=100 \
  apps/browser/src \
  apps/demo \
  scripts \
  services/science/science_backend \
  apps/apple/App \
  apps/apple/MacApp \
  apps/apple/Packages/OtherlightCore/Sources \
  apps/apple/Packages/OtherlightScience/Sources
