# Release status

## Evidence cutoff

This document describes repository capabilities as of 2026-08-27. It is not a
release qualification record.

## Verdict

Not release-qualified. The Browser, Apple app, service, contracts, and docs
now have documented current locations, but a release claim requires fresh
results from the applicable local and external lanes.

## Candidate identity

No candidate tag, signed artifact, deployment, or published release is claimed
by this document.

## Required local evidence

```bash
pnpm hygiene:public
pnpm hygiene:docs
pnpm hygiene:swift-docs
pnpm architecture:check
pnpm physics-registry
pnpm ci:verify
pnpm science:backend:check
pnpm science:backend:test
pnpm native:core:test
pnpm native:science:test
```

Run the service and Apple lanes only in environments with their declared
toolchains and dependencies. Record their exact results, platform, and revision
before promotion.

## Open blockers

- No current consolidated Browser, service, and Apple qualification evidence is
  recorded here.
- A loopback science result does not establish remote-service, multi-user, or
  research-validation claims.
- Signing, notarization, hosted deployment, device testing, and remote CI are
  separate owner-controlled evidence lanes.

## Next gate

Run the checks above on the intended candidate revision, inspect the resulting
contracts and artifacts, then update this document with dated evidence and any
remaining external blockers.
