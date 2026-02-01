# Photometry Model

Transit flux:

- A multiplicative attenuation factor F_transit(t) is computed from
  projected occulters on the stellar disk.
- Models include uniform disk, limb darkening, and transmissive occulters.

Additive flux terms:

- Planet/moon phase curves (reflected + thermal).
- Stellar variability (beaming/ellipsoidal toy terms).
- Forward scattering (optional).

Composition:

- $F_{\mathrm{total}} = (F_{\star} + F_{\mathrm{stellarVar}})\,F_{\mathrm{transit}} + F_{\mathrm{planet}} + F_{\mathrm{moon}} + F_{\mathrm{scatter}}$

Multi-band support:

- Limb darkening can be selected per bandpass.
- Transmission can be sampled on a lambda grid.

Related code:

- `src/sim/transitFlux.ts`
- `src/photometry/*`
