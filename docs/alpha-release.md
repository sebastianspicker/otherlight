# Alpha release procedure

An alpha release is a claim about one specific revision and an explicitly named
set of Browser, service, Apple, and contract capabilities. It says nothing about
complete scientific validation or production readiness.

## Define the candidate

Before running anything, record the exact commit and pick which surfaces the
candidate includes:

- the ordinary Browser bundle;
- the GitHub Pages Browser bundle (plus the static screenshot tour);
- the Python science service or wheel;
- the macOS, iPhone, or iPad app;
- a signed and notarized macOS DMG;
- any changed V4, V5, workspace-v1, or capability contracts.

## Gather the evidence

Run the Browser gate from the repository root:

```bash
pnpm ci:verify
```

Then run every independent lane the candidate includes:

```bash
pnpm science:backend:check
pnpm native:core:build
pnpm native:science:build
```

When you claim CI-equivalent service or Apple evidence, use the locked wheel
and Xcode build checks described in [Continuous integration](ci.md). A
macOS distribution also needs the signed archive, DMG, notarization, and
verification procedure in the [Apple guide](../apps/apple/README.md).

Check capability and model claims against
`contracts/capabilities-v1/manifest.json` and
`docs/physics/model-registry.json`. A successful build does not promote scientific
evidence status.

## Record the qualification

Update [RELEASE_STATUS.md](../RELEASE_STATUS.md) with the candidate revision, the
date, the included surfaces, the exact checks that passed, toolchains,
artifacts, and every skipped or externally controlled lane. Static captures and
fixture replays are presentation or contract evidence, never runtime execution
evidence.
