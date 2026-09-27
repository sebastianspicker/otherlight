# Third-party notices

Otherlight itself is distributed under the [MIT License](LICENSE). Each dependency
keeps its own license and notices; the authoritative lists live in the checked-in
JavaScript lockfile and in the service and Apple package metadata.

The macOS-only Swift science package includes a DOP853 implementation at
`apps/apple/Packages/OtherlightScience/Sources/TransitScience/DOP853.swift`, and
its source notice is retained alongside that file.

The Browser's real-system catalog records its provenance in the checked-in
snapshot metadata under `apps/browser/src/application/catalog/`. Review the
source terms before refreshing that dataset.

## Fonts

The Browser self-hosts three typefaces as subset, variable WOFF2 files under
`apps/browser/src/presentation/styles/plate-figure/fonts/`, each under the
[SIL Open Font License 1.1](https://openfontlicense.org). Each license text is
kept beside its font file.

| Typeface                   | Copyright                                                | Source                                                 |
| -------------------------- | -------------------------------------------------------- | ------------------------------------------------------ |
| Atkinson Hyperlegible Next | 2020–2024 The Atkinson Hyperlegible Next Project Authors | github.com/googlefonts/atkinson-hyperlegible-next      |
| Atkinson Hyperlegible Mono | 2020–2024 The Atkinson Hyperlegible Mono Project Authors | github.com/googlefonts/atkinson-hyperlegible-next-mono |
| STIX Two Text              | 2001–2021 The STIX Fonts Project Authors                 | github.com/stipub/stixfonts                            |

The files were subset to Latin, Greek, general punctuation, arrows and the
mathematical symbols used in the interface; the variable weight axis is
retained.
