/** Checks that a served production build exposes its same-origin chromatic worker asset. */
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const base = new URL(process.argv[2]);
const response = await globalThis.fetch(base);
assert.equal(response.status, 200);
const html = await response.text();
assert.match(html, /worker-src (?:'|&#39;)self(?:'|&#39;)/);
const assets = await readdir(path.join(root, "dist/assets"));
const worker = assets.find((name) => /^chromatic\.worker-.+\.js$/.test(name));
assert.ok(worker, "build must emit a chromatic module worker");
const workerUrl = new URL(`assets/${worker}`, base);
assert.equal(workerUrl.origin, base.origin);
const workerResponse = await globalThis.fetch(workerUrl);
assert.equal(workerResponse.status, 200);
assert.match(workerResponse.headers.get("content-type") ?? "", /javascript/);
const bootstrap = assets.find((name) => /^bootstrap-.+\.js$/.test(name));
assert.ok(bootstrap);
const source = await readFile(path.join(root, "dist/assets", bootstrap), "utf8");
assert.ok(source.includes(worker), "composition chunk must reference emitted worker");
process.stdout.write(
  `Worker HTTP/CSP asset check passed at ${workerUrl}; browser execution still requires rendered validation.\n`,
);
