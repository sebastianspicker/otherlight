/** Captures the curated public-alpha gallery through the stable CLI contract. */

import { withCaptureServer } from "./capture-github-screenshots.server.mjs";
import { captureReleaseGallery } from "./capture-github-screenshots.scenarios.mjs";

await withCaptureServer(captureReleaseGallery);
