# Security policy

## Supported versions

No tagged release is currently published. Security reports are accepted for the
current default branch and the browser, Scientific service, and native Apple
code in this repository.

## Reporting a vulnerability

Do not open a public issue for a vulnerability.

Use GitHub Security Advisories:

1. Open the repository Security tab.
2. Select `Report a vulnerability`.
3. Include the affected revision, reproduction steps, impact, and relevant
   configuration.

If private reporting is unavailable, contact the maintainer through GitHub and
request a private channel.

The target for initial triage is five business days. Do not publish exploit
details before the maintainer has assessed the report and coordinated a fix.

## Trust boundaries

### Browser application

The browser application is a static Vite bundle. It has no account, remote
session, or server-side authentication model. Its inputs include form controls,
URL state, imported `.otherlight` files, and committed JSON data.

`vite.config.ts` sets CSP and related response headers for development and local
preview. A separate hosting system must preserve equivalent headers.

### Scientific service

The Python service is for one local user. It must bind to `127.0.0.1` and must
not be exposed to a LAN or the public internet.

The browser client accepts only loopback HTTP service URLs. It rejects
credentials, query strings, fragments, non-loopback hosts, and non-HTTP
schemes.

The service has no authentication or authorization. Arrow files in
`.science-cache/` are content-addressed local files, not protected storage.
Request size, body count, sample count, queue capacity, polling, and terminal
record retention are bounded, but these limits do not make the service suitable
for hostile remote clients.

### Native Apple application

The native application has no runtime network client, account, analytics,
telemetry, or cloud synchronization. It uses sandboxed user-selected file
access. See [`native-apple/PRIVACY.md`](native-apple/PRIVACY.md).

### Maintenance scripts

`scripts/fetch-real-systems-snapshot.mjs` connects to the NASA Exoplanet Archive
only when invoked. The browser reads the committed snapshot and does not contact
NASA at runtime.

Apple release scripts use developer-supplied signing identities, team IDs, and
notary keychain profiles. Do not place those values or exported signing
material in the repository.

## Dependency and source checks

- pnpm installs use `pnpm-lock.yaml`.
- `pnpm-workspace.yaml` permits the required esbuild install script and pins
  selected transitive dependency overrides.
- Python development and runtime extras are pinned in
  `science_backend/pyproject.toml`.
- GitHub Actions run CodeQL and gitleaks on pull requests and pushes.
- Dependabot monitors pnpm, Python, and GitHub Actions dependencies.
- A scheduled and manually dispatched workflow runs
  `pnpm audit --audit-level=moderate`.

Run the dependency check locally with:

```bash
pnpm audit:security
```

## Sensitive files

Do not commit:

- `.env` files;
- credentials, private keys, certificates, or provisioning profiles;
- Apple signing or notarization material;
- local databases and caches;
- scientific result files;
- browser traces, reports, or build products;
- machine-specific editor or development-tool state.

`pnpm hygiene:public` checks repository paths and selected text content.
Authentication-bearing package-manager configuration is covered by gitleaks
rather than printed by the public-surface checker.
