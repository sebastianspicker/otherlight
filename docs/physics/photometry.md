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

- F_total = (F_star + F_stellarVar) \* F_transit + F_planet + F_moon + F_scatter

Multi-band support:

- Limb darkening can be selected per bandpass.
- Transmission can be sampled on a lambda grid.

Related code:

- `src/sim/transitFlux.ts`
- `src/photometry/*`
