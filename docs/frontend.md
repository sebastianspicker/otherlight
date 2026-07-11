# Frontend conventions

The application is a single-page Vite/TypeScript product built with native DOM templates and canvas renderers. It has no router, backend, authentication surface, persistent user data, or runtime network dependency.

## Product state in URLs

Stable shareable context uses query parameters:

| Parameter  | Values                          | History behavior   |
| ---------- | ------------------------------- | ------------------ |
| `mode`     | `simulation`, `lab`             | push               |
| `ui`       | `essential`, `advanced`         | replace            |
| `source`   | `preset`, `real`                | push with scenario |
| `scenario` | stable preset or real-system ID | push               |
| `lab`      | `preset`, `binary`              | push               |
| `lesson`   | stable lesson ID                | push               |
| `runtime`  | `interactive`, `reference`      | replace            |

Unknown or incompatible values fall back to a valid state and produce a status message. No router dependency is required.

## DOM and accessibility

- Keep stable IDs used by application wiring and tests. Add classes and `data-*` attributes for styling and state.
- Runtime controls precede visual output in DOM order.
- Every canvas belongs to a `<figure>` with a linked textual state summary and a data-export path where applicable.
- Use native forms, buttons, selects, details, and dialogs. Do not replace standard controls for appearance.
- Validation must not silently clamp or restore user-submitted invalid scientific text.
- Status regions announce meaningful changes, not every animation frame.

## Visual system

`DESIGN.md` and `.impeccable/design.json` are the authoritative design references. The shell is light and neutral; plots remain dark. Interface type uses the system sans stack and numerical data uses the system mono stack. Prefer flat tonal layers and borders over cards and shadows.

## Responsive support

The full workflow targets laptop/desktop and tablet landscape. Phone widths remain readable and operable without hiding critical controls; the public alpha does not promise a separate high-density expert workflow for phones.

Required viewport checks are 320, 390, 768, 1024, and 1280 CSS pixels, plus 200% zoom. Horizontal page scrolling is not allowed except within an explicitly labelled two-dimensional data region.

## Browser and accessibility matrix

- Chromium, Firefox, and WebKit desktop journeys.
- Tablet landscape and 390px mobile smoke journeys.
- Keyboard-only focus order and visible focus.
- Automated axe checks with no serious or critical violations are a release target; the current
  checkout does not yet include the axe Playwright development package.
- Manual VoiceOver and NVDA checks for one transit and one binary lesson before teaching-production use.

## Performance budgets

- Production JavaScript: less than 145 KB gzip unless reviewed.
- CSS: less than 6 KB gzip unless reviewed.
- A paused or hidden simulation must not maintain a continuous redraw loop.

## Known public-alpha limits

Playwright currently defines Chromium, Firefox, WebKit, tablet-landscape, and mobile-smoke projects.
The browser executables must be installed locally before the complete matrix can run. Automated
accessibility checks do not replace a manual screen-reader walkthrough. Canvas collision, tooltip
placement, contrast, clipping, and live focus behavior require rendered-browser verification.
Permission-denial testing is not applicable because the product has no authentication or role model.
