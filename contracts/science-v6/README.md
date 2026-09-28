# Science V6 contracts

This directory owns the additive scientific dataset and result shapes used by the
`/v2` service family. It does not revise `science-v5`, and it does not make a V6
physical model available.

`dataset-import-v2.schema.json` defines five exact-field, SI-declared input
families: passband response, stellar-intensity grid, atmospheric transmission or
effective radius, scattering phase function, and stellar-variability power
spectral density. The Python service enforces strictly increasing axes, paired
shapes, grid shapes, and a 100,000-sample ceiling.

Dataset identity is `ds-<contentSha256>`, where `contentSha256` hashes canonical
JSON, and `sourceByteSha256` hashes the exact accepted upload. The service accepts
only uncompressed UTF-8 JSON with media type
`application/vnd.otherlight.science-dataset+json; charset=utf-8` and keeps imports
in process memory.

When a differently formatted upload has the same canonical content, import is
idempotent and returns the existing descriptor; its `sourceByteSha256` keeps the
provenance of the first accepted byte representation.

The job, artifact, and run-manifest schemas establish the future V6 result
boundary. The transit-timing request, result, and ordered Arrow descriptor define
the ephemeris, event, work, numerical-error, and provenance fields. These schemas
do not advertise a V6 job route or scientific result producer.
