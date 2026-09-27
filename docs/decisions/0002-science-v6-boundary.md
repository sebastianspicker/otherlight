# ADR 0002: Add science-v6 and `/v2` without changing V5

- Status: accepted; dataset boundary implemented, job and model slices pending
- Date: 2026-09-04

## Context

`science-v5` and `/v1` define a strict single-artifact radial-velocity boundary.
Transit timing, physically bounded photometry, imported model-input datasets,
multiple artifacts, and richer provenance need incompatible request and result
shapes. Extending V5 in place would weaken fail-closed consumers and make the
existing fixtures ambiguous.

## Decision

Freeze `science-v5` and every `/v1` route. Add sibling strict
`contracts/science-v6/` schemas and `/v2` routes for capabilities, in-memory
datasets, jobs, cancellation, results, and artifacts. V6 uses `artifacts[]` and
run-manifest V3, and unknown fields and versions fail closed in every language.

Imported datasets are model inputs only. They use one bounded JSON media type,
declared SI units, canonical content hashes, content-addressed identifiers, and
process-memory storage. Paths, URLs, bookmarks, multipart bodies, CSV, Arrow
input, archives, redirects, compression, duplicate keys, and unknown fields are
not accepted.

## Consequences

- Existing V5 clients and fixtures keep their exact behavior.
- V6 can evolve through qualified capability slices without relabelling Education
  preview models as scientific execution.
- TypeScript, Python, and Swift each need independent strict validators and
  shared canonical fixtures before any V6 capability can be advertised.
- Dataset quotas, deletion-in-use semantics, artifact integrity, loopback Host
  validation, and hostile-local-process residual risk are part of the public
  boundary, not implementation details.
- This record authorizes an additive design; it does not mark V6 implemented or
  available.
