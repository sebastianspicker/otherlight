# Continuous integration

The repository has distinct Browser, science-service, and Apple lanes. Their
workflow definitions are the source of truth for triggers and runner images.

## Browser lane

The standard Browser gate is:

```bash
pnpm ci:verify
```

It runs public and documentation hygiene, Swift documentation hygiene,
architecture and physics-registry checks, linting, TypeScript checks, Vitest,
and the production Vite build. It uses `apps/browser/` as the Browser project
root.

## GitHub Pages lane

The Pages workflow runs for `main`; manual dispatches are honored only when
`main` is selected. Its verification job has read-only repository access and
performs a frozen pnpm 11.4 install on Node 22, the standard Browser
verification, and the Pages-specific build and smoke checks. The deployment
job alone receives `pages:write` and `id-token:write`.

Local equivalents are:

```bash
pnpm build:pages
pnpm smoke:pages
```

The artifact is the Vite Browser output in `dist/`, configured for
`/otherlight/`. The retained static tour under `apps/demo/` and its
`pages-dist/` build are not published. GitHub Pages hosts only static assets:
Education features run client-side, while Apple functionality and the local
Python scientific executor remain unavailable.

## Science lane

The service is verified separately with its Python environment:

```bash
pnpm science:backend:check
pnpm science:backend:test
```

The service may be unavailable at runtime when its optional execution
dependencies are absent. That is a capability state, not an Education
fallback.

## Apple lane

```bash
pnpm native:core:test
pnpm native:science:test
```

Apple workflow paths begin at `apps/apple/`. Native release, signing, and
notarization are distribution operations, not normal verification.

Keep workflow permissions minimal, actions pinned, timeouts finite, and
verification free of upload, signing, or publication side effects.
