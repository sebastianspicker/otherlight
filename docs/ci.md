# Continuous integration

Workflow files in `.github/workflows/` define the runner images, triggers,
permissions, and pinned action revisions.

## Browser

`.github/workflows/ci.yml` runs on pushes and pull requests to `main`. Its
Browser job installs the frozen pnpm lockfile, then runs:

```bash
pnpm ci:verify
```

This checks ESLint, Prettier, Stylelint, ShellCheck, TypeScript 7 and
TypeScript 6 compatibility, and the production Vite build. The Pages workflow
runs the same gate before `pnpm build:pages:site` and uploads `dist/`. The
Pages artifact includes the Browser and static screenshot tour; its scientific
view is a labelled fixture replay, with no Python runtime.

## Science service

The Python job uses Python 3.14.6 and `uv==0.10.7` to synchronize the locked
`dev` extra. It compiles the source, builds a wheel, installs that wheel in a
fresh environment, and imports the installed package with a version check.
The service runs only on loopback when started locally.

## Apple

`.github/workflows/native-apple.yml` builds both Swift packages, checks Swift
formatting, builds the macOS and iOS Simulator apps, and archives the generic
iOS app without signing. It uses Xcode 26.6 and Swift 6.3.3.
`.github/workflows/native-macos-dmg.yml` can build an unsigned, ephemeral
Universal 2 DMG and checksum on manual dispatch. Signed distribution is
documented in the [Apple guide](../apps/apple/README.md).

## Security and release evidence

CodeQL analyzes JavaScript/TypeScript and Python on `main` pushes and pull
requests and on a weekly schedule. Gitleaks scans push and pull-request
history. The dependency-audit workflow runs `pnpm audit:security` weekly and
on manual dispatch.

There is no automated release publication. Before a release claim, identify
the exact revision and gather evidence for every included product and
scientific boundary. See [alpha release procedure](alpha-release.md),
[release status](../RELEASE_STATUS.md), and
[performance validation](performance.md).
