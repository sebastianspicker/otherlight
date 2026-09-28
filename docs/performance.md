# Performance validation

Performance changes must preserve Education V4, science V5/V6, workspace-v1, the
capability manifests, Arrow columns, and the checked-in parity fixtures. Timing
is informational; work counts, queue bounds, equality checks, and compact
retention are correctness requirements.

## Reproducible runs

Run from the repository root with the documented toolchains, and avoid
concurrent builds or profiling while you compare latency. Keep the workload
version, seed, warmup count, repetition count, release/debug configuration, and
machine the same, and retain both raw reports. Run latency and memory passes
separately. Heap and RSS deltas include allocator and garbage-collection effects
and are not exact allocation counts.

```bash
pnpm benchmark:browser
source scripts/select-swift-toolchain.sh
swift --version
swift run --package-path apps/apple/Packages/OtherlightCore OtherlightBenchmark
```

The Browser harness uses four fixed frames, 256 preview points, and three bands
at 450/550/700 nm with 96 samples over -10,000 to 10,000 seconds. It records
Node and platform details, the seed, two warmups, nine repetitions, raw latency
samples, work counts, and a separate heap/RSS pass, then checks retained-runtime
band values against fresh-runtime values. For maximum-size imports and
rich/compact forward output, run the service benchmark documented in the
[science README](../services/science/README.md).

The Apple harness reports its fixed workload version, seed, toolchain, warmups,
repetitions, sample count, min/median/p95/max latency, and separate
resident-memory measurements for the interactive, reference, and series
workloads. Public full-state and compact publication tests establish scientific
equality independently of those Education measurements.

## Browser responsiveness and worker lifecycle

Serve each of `pnpm build` and `pnpm build:pages` with its matching preview
command; Pages uses `/otherlight/`. Then, in a real browser:

1. Confirm the shell, canvas, text evidence, and primary controls render. Check
   the console and network panel for CSP violations or failed worker assets.
2. Select a multiband Education preset. Play, pause, switch tracking between
   fixed/dynamic/live, and switch display between physical/measured. Confirm
   chromatic updates, responsive controls, and unchanged sample counts.
3. Record a performance trace for at least 10 seconds with fixed tracking.
   Unchanged frames should not rebuild another 256-point preview. Live
   annotations, comparisons, and epoch ghosts must still refresh. Under dynamic
   tracking, band computation belongs to the worker, request starts are at least
   100 ms apart, and the request backlog must not grow.
4. Reset, seek via a Guided Lab, clear, and Undo. Verify one fresh preview per
   invalidation and a restored history and range on Undo. Replace the scenario
   while worker work is in flight and confirm old-generation overlays never
   return.
5. Hide the tab during work, wait, and show it again. Confirm work stops while
   hidden and the latest requested overlay resumes. Reload or reinitialize and
   verify the old worker terminates.
6. Block the worker asset in developer tools and reload. Confirm the primary
   simulation still plays and an overlay-specific warning appears.

HTTP and unit checks do not establish visual responsiveness or browser CSP
execution, so record any browser check you could not run.

## Apple retained-history profiling

Build the documented macOS and simulator targets, choose the same accepted
scenario, and profile each runtime mode independently in Instruments
Allocations and Time Profiler. Use separate runs for allocation and latency
evidence, and record the toolchain, target, device, build configuration,
duration, sample cadence, and scenario. Capture snapshots before playback, after
a fixed duration, after reset, and after closing the document. Inspect retained
engines and history buffers; only the selected engine should exist. Compare
series requests and native V5 publication against identical samples. Public
full-state propagation intentionally retains sample states, so publication should
retain only the time/RV arrays and metadata. Restructuring history is outside
this change.
