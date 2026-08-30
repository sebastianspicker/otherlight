# Physics and visualization boundary

Browser rendering is a presentation concern. Canvas and plot code lives under
`apps/browser/src/presentation/render/`; it consumes accepted domain simulation
frames and presentation view data. It must not invent physics, mutate the
scenario, submit science requests, or make a capability claim.

The domain produces Education simulation and diagnostic data under
`apps/browser/src/domain/`. Application and presentation controllers select
what to show. The composition root wires those pieces together.

Every canvas should have a semantic figure and linked text summary. Debug and
teaching overlays must be derived from the active accepted model state. A
Scientific-profile result is rendered only after the loopback V5 adapter has
returned a validated terminal result; an Education frame is never a fallback.

See [../architecture.md](../architecture.md) for layer direction and
[../physics/model-status.md](../physics/model-status.md) for model scope.
