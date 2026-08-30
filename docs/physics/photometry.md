# Photometry scope

Browser photometry belongs to `apps/browser/src/domain/photometry/` and feeds
the Education simulation and presentation layers. It provides learning-facing
light curves and diagnostics within the domains recorded in
[model-registry.json](model-registry.json).

The V5 service does not provide photometry. A Browser light curve must not be
attached to a V5 result as though it were a service-produced scientific
observable. New photometry capability requires its own contract, implementation,
validation, and registry evidence.
