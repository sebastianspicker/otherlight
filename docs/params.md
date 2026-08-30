# Browser parameter model

`BrowserScenarioDraft` is the mutable Browser authoring model. It supports controls,
presets, and accepted scenario state; it is not a cross-language wire format.

The canonical conversion is:

```text
BrowserScenarioDraft -> EducationScenarioV4 -> V4 runtime
```

`apps/browser/src/application/browserScenarioAdapter.ts` is the sole boundary
that converts authoring state to a serializable `EducationScenarioV4`.
The V4 contract and parity fixtures are in `contracts/education-v4/`.

For a scientific action, the supported V4 subset is compiled into a strict V5
request. The compiler rejects dynamic orbit providers, unsupported dynamics,
and fields with no V5 meaning. See [architecture.md](architecture.md) and
[physics/v5-scientific-contract.md](physics/v5-scientific-contract.md).

Controls and parameter parsing belong in
`apps/browser/src/presentation/ui/`; application defaults and presets belong in
`apps/browser/src/application/`; mathematical invariants belong in `domain/`.
Do not store DOM state in `BrowserScenarioDraft`.

`.otherlight` files persist accepted V4 scenario state, product context, guided
learning state, and an optional V5 request under `workspace-v1`. They do not
persist draft input, animation history, or live tasks.
