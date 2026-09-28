# Screenshot tour

`apps/demo/` is a small static tour of Otherlight product screens built from
plain HTML, CSS, and JavaScript. It is presentation material: it does not load
the Browser simulation, create workspaces, call the science service, or prove
runtime behavior. Every control pictured in the captures is a painted pixel.

The Pages workflow publishes this tour at
<https://sebastianspicker.github.io/otherlight/demo/>, alongside the live app at
<https://sebastianspicker.github.io/otherlight/>. Captures come from the same
Pages build the workflow ships, so the tour matches what visitors see.

## Local review

Open `apps/demo/index.html` directly in a browser, or assemble the tour with its
tracked screenshot inputs from the repository root:

```bash
pnpm build:demo
```

That writes the ignored `pages-dist/` directory. To produce the full deployed
artifact instead, run `pnpm build:pages:site`, which builds the Browser into
`dist/` and places the tour at `dist/demo/`.

## Editing

Edit the source files in this directory and the tracked captures under
`docs/screenshots/web/`. Do not edit `pages-dist/` or `dist/`; both are
generated.

Captures are 2x screenshots of the Pages build, downscaled to 1440 px wide. To
refresh one, build and preview the Pages app, drive the state you want, and
replace the matching file under `docs/screenshots/web/`.
