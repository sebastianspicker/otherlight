# Alpha release guide

An alpha release communicates a bounded product surface, not complete
scientific validation or distribution readiness. The candidate must identify
which Browser, service, Apple, and contract capabilities it includes.

## Required evidence

```bash
pnpm ci:verify
pnpm science:backend:check
pnpm science:backend:test
pnpm native:core:test
pnpm native:science:test
```

Record the exact revision, command output, toolchain, and any omitted lane in
[RELEASE_STATUS.md](../RELEASE_STATUS.md). Validate V4, V5, workspace-v1, and
capability-registry changes against their consumers before release.

## Boundaries

- Browser Education is a teaching preview within the model limits in the
  physics registry.
- The science service is optional, loopback-only, and limited to advertised V5
  capability.
- The Apple app is an Education product with a smaller surface than the
  Browser.
- Static demo captures are presentation evidence, not runtime execution
  evidence.

Signing, notarization, hosted deployment, device proof, and publication need
their own dated evidence; none follows from a successful local Browser build.
