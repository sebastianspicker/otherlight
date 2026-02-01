# Full Physical Description and Derivations

This document has two parts:

- Part A: Implemented model (as in this codebase).
- Part B: Ideal / complete physical model (not fully implemented here).

Notation:

- Vectors are bold in the text but written as r, v, n in ASCII.
- The star is at the origin unless otherwise stated.
- mu = G\*M is the gravitational parameter in L^3/T^2.
- Observer direction n_obs points from the star toward the observer.
- Angles are radians in the model.

PART A. IMPLEMENTED MODEL (CURRENT CODE)

1. Units and conventions

- Length: arbitrary but internally consistent simulation units.
- Time: seconds.
- Angle: radians in physics; UI uses degrees then converts.
- Flux: normalized to a baseline stellar flux near 1.0.

2. Coordinate frames and projection

2.1 Inertial frame

Positions r(t) are in an inertial frame. The sky plane is defined by n_obs:

- n_obs = normalized observer direction (star -> observer)
- A body is "in front of the star" if r dot n_obs > 0.

  2.2 Sky-plane projection

Let {ex, ey, ez} be an orthonormal basis with ez = n_obs and ex, ey spanning the sky plane.
For any inertial r:

- x = r dot ex
- y = r dot ey
- z = r dot ez

Sky projection returns (x, y, z), where larger z is closer to the observer.

3. Keplerian orbits (kinematic mode)

3.1 Elements

Orbit elements are:

- a (semi-major axis), e (eccentricity)
- inc (inclination), Omega (longitude of ascending node)
- omega (argument of periapsis)
- period (orbital period), t0 (epoch)

  3.2 Mean anomaly

Mean motion:

n = 2\*pi / period

Mean anomaly:

M(t) = n \* (t - t0)

3.3 Kepler equation (elliptic)

Solve for eccentric anomaly E:

M = E - e \* sin(E)

3.4 True anomaly and radius

r = a _ (1 - e _ cos(E))
nu = atan2( sqrt(1 - e^2) \* sin(E), cos(E) - e )

3.5 Perifocal position and inertial rotation

Perifocal vector:

r*pqw = (r * cos(nu), r \_ sin(nu), 0)

Rotate by Omega, inc, omega to inertial coordinates
(see src/physics/frames.ts).

4. Planet-moon barycentric split (Kepler mode)

If both masses are provided, the planet orbit is interpreted as the
planet-moon barycenter orbit. Let:

- r_bary be barycenter position (from Kepler orbit)
- r_rel be moon position relative to planet (from moon Kepler orbit)
- m_p, m_m be planet and moon masses

Then:

r*planet = r_bary - (m_m / (m_p + m_m)) * r*rel
r_moon = r_bary + (m_p / (m_p + m_m)) * r_rel

5. N-body dynamics (full integration)

5.1 Newtonian acceleration

For bodies i and j with positions r_i, r_j:

a_i += mu_j \* (r_j - r_i) / |r_j - r_i|^3

This is applied for star, planet, moon, and any perturbers.

5.2 Plummer softening

To avoid singularities:

|r|^3 -> (|r|^2 + eps^2)^(3/2)

5.3 Velocity-Verlet integration

Given state (r0, v0), acceleration a0, and timestep dt:

r1 = r0 + v0 _ dt + 0.5 _ a0 _ dt^2
a1 = a(r1)
v1 = v0 + 0.5 _ (a0 + a1) \* dt

5.4 Initial conditions from orbit elements

At an anchor time t0:

- Planet-moon barycenter orbit is computed with mu = mu_star + mu_planet + mu_moon.
- Moon relative orbit uses mu = mu_planet + mu_moon.
- These are split into planet and moon positions about the barycenter.

Perturbers are initialized from their Kepler elements using mu = mu_star + mu_pert.

5.5 System barycenter removal

The full system is shifted so that the mu-weighted center of mass is at the origin:

r*cm = sum(mu_i * r*i) / sum(mu_i)
v_cm = sum(mu_i * v_i) / sum(mu_i)

Then:

r_i <- r_i - r_cm
v_i <- v_i - v_cm

5.6 GR correction (N-body mode)

An approximate star-centric 1PN correction is applied to each body relative to the star.
For each body (relative position r_rel, velocity v_rel):

a*GR = (mu_star / (c^2 * r^3)) \_ [ (4*mu_star/r - v_rel^2) * r_rel + 4*(r_rel dot v_rel) * v_rel ]

This is a Schwarzschild 1PN correction for a test body around a central mass.
It is applied in a mass-weighted way between star and body.

6. Relativity and timing

6.1 Light-time delay (Roemer-like)

For a body at position r (relative to the star):

delta_t_roemer = (r dot n_obs) / c

6.2 Shapiro delay (point-mass approximation)

For a point mass mu at the origin:

delta*t_shapiro = (2 * mu / c^3) \_ ln( (r + z) / r )

where:

r = |r|
z = r dot n_obs

A minimum impact parameter can be used to regularize the log.

6.3 Retarded time solve

We solve for t_emit with fixed-point iteration:

t_emit = t_obs + delta_t_roemer(r(t_emit)) + delta_t_shapiro(r(t_emit))

7. GR apsidal precession (Kepler mode)

When not in N-body mode, a per-orbit precession is derived from:

delta*omega = 6*pi*mu / (a * (1 - e^2) \_ c^2)

If a non-zero per-orbit override is given, it is used instead.

8. Transit photometry (multiplicative)

8.1 Uniform disk (single occulter)

The star is a uniform disk with radius R. For a single circular occulter:

F = 1 - A_overlap / (pi \* R^2)

The circle-circle overlap area (R >= r):

A = R^2 _ alpha + r^2 _ beta - 0.5 \* sqrt( (-d+R+r)(d+R-r)(d-R+r)(d+R+r) )

where:

alpha = acos( (d^2 + R^2 - r^2) / (2 d R) )
beta = acos( (d^2 + r^2 - R^2) / (2 d r) )
d is center separation in the sky plane.

8.2 Multiple occulters

For multiple occulters, the union of silhouettes is integrated numerically
using a deterministic midpoint method on the stellar disk.

8.3 Limb darkening

mu = cos(theta) = sqrt(1 - (x^2 + y^2)/R^2)

Quadratic:

I(mu) = 1 - u1 _ (1 - mu) - u2 _ (1 - mu)^2

Three-parameter (reduced Claret):

I(mu) = 1 - a1 _ (1 - mu^0.5) - a2 _ (1 - mu) - a3 \* (1 - mu^1.5)

Four-parameter (Claret):

I(mu) = 1 - a1 _ (1 - mu^0.5) - a2 _ (1 - mu) - a3 _ (1 - mu^1.5) - a4 _ (1 - mu^2)

8.4 Brightness patches (spots/faculae)

Patches are 2D masks on the sky plane. The local intensity is multiplied
by a patch factor f_patch(x,y) based on circular or elliptical membership.

8.5 Oblate bodies and rings

Oblate bodies are projected as ellipses with:

rx = R
ry = R \* (1 - oblateness)

Rings are projected annuli; an original circular ring of radius r becomes
an ellipse with minor axis r \* cos(inc).

8.6 Transmissive occulters (atmosphere)

Total transmission is a product:

T_total(x,y) = product_i T_i(rho_i)

The attenuated stellar flux is:

F = (int I(x,y) _ P(x,y) _ T_total(x,y) dA) / (int I(x,y) \* P(x,y) dA)

The default "exponential halo" uses:

tau(rho) = tau0 \* exp(-(rho - r0)/H)
T = exp(-tau)

9. Phase curves (additive)

9.1 Phase angle

Let:

s_hat = normalize(-r_body) (body -> star)
o_hat = normalize(n_obs) (body -> observer)

Then:

cos(alpha) = s_hat dot o_hat
alpha = arccos(cos(alpha))

Interpretation:

alpha = 0 full phase
alpha = pi new phase

9.2 Reflected light

Lambert law:

Phi_L(alpha) = [sin(alpha) + (pi - alpha) * cos(alpha)] / pi

Cosine approximation:

Phi_C(alpha) = (1 + cos(alpha)) / 2

Reflected flux:

f_refl = A_refl \* Phi(alpha)

With physical scaling enabled:

A_refl = reflAmp \* (R_body / r)^2

9.3 Thermal emission

Geometric weight uses the same phase functions for non-constant models:

f_therm = A_therm \* W(alpha)

With physical scaling:

A_therm = thermAmp \* (R_body / R_star)^2

9.4 Thermal inertia (1-pole response)

Let omega = 2\*pi / period and tau be the thermal timescale.

Define:

x = omega \* tau
lag = atan(x)
gain = 1 / sqrt(1 + x^2)

Then the thermal weight is modified by:

W*eff = r + (1 - r) * gain \_ W(alpha + lag)

where r is a redistribution factor in [0,1].

10. Stellar variability (additive)

Phase is computed by either:

phi = 2*pi * (t - t0) / period

or, for eccentric orbits, by true anomaly.

The variability model is:

f*var = C + A_beam * sin(phi + phi*b) + A_ellip * cos(2\*(phi + phi_e))

11. Forward scattering (additive)

Henyey-Greenstein phase function:

p(theta) = (1/(4*pi)) * (1 - g^2) / (1 + g^2 - 2g\*cos(theta))^(3/2)

The scattering angle theta is approximated using the body direction and n_obs.

12. Mutual events and secondary eclipse (additive terms)

If a body is occulted by another in the sky plane, its additive flux is
reduced by the visible disk fraction. A behind-the-star gate is also applied.

13. Measurement layer

13.1 Finite exposure smearing

Flux can be boxcar-averaged around t with N subsamples:

F_smear(t) = (1/N) \* sum_k F(t + delta_k)

13.2 Instrument systematics and noise (summary)

Deterministic trends (additive):

- Roll systematics: A_roll * sin(2*pi\*t/P + phi0)
- Linear drift: slope \* t
- Intrapixel modulation: separable sinusoid in (x,y)

Correlated noise (additive):

- OU / AR(1): x\_{t+dt} = x*t * exp(-dt/tau) + sigma \_ sqrt(1 - exp(-2dt/tau)) \* N(0,1)
- 1/f bank: sum of OU components with log-spaced taus
- Random walk: x\_{t+dt} = x*t + sigma_rw * sqrt(dt) \_ N(0,1)

Photon noise:

Flux is converted to electrons:

N*e = max(0, F * throughput \_ electronsPerUnitFlux \* exposureSec)

Poisson noise is sampled from N_e; for large N_e a Gaussian approximation is used.

PART B. IDEAL / COMPLETE PHYSICAL MODEL (TARGET)

This section describes a more complete physical model beyond what the
current implementation provides. It is a roadmap for scientific completeness.

1. Dynamics

- Full N-body for all planets, moons, and the star (already implemented).
- Higher-order GR terms and full post-Newtonian N-body (not implemented).
- Tides, oblateness-driven precession, and spin-orbit coupling.

2. Relativity and timing

- Full GR time delay including Shapiro and Einstein delays in a multi-body field.
- Consistent time standards (TT, TDB) and barycentric corrections.
- Relativistic light bending for transit geometry (small for most systems).

3. Stellar surface physics

- Physically modeled spots and faculae anchored to a rotating stellar surface.
- Differential rotation, latitude-dependent spot lifetimes, and active regions.
- Granulation noise and power spectral density matched to stellar type.

4. Atmospheric transmission and emission

- Radiative transfer through multi-layer atmospheres with wavelength-dependent
  opacity, scattering, and refraction.
- Temperature-pressure profiles and non-isothermal emission.
- Clouds and hazes with Mie or Rayleigh scattering.

5. Limb darkening

- Coefficients derived from stellar atmosphere models given Teff, log g, [Fe/H],
  and bandpass, with physical constraints enforced.

6. Planet and moon thermal physics

- Energy balance models with insolation, albedo, and heat transport.
- Spatially varying surface temperature and finite heat capacity.
- Thermal phase curves derived from the temperature map, not a geometric weight.

7. Instrument models

- Detector read noise, gain, saturation, and non-linearity.
- Time-correlated systematics informed by spacecraft telemetry.
- Pixel response non-uniformity with pointing jitter model.

8. Photometry and spectra

- Multi-band photometry and spectroscopy with bandpass integration.
- Wavelength-dependent limb darkening and atmosphere effects.

References (code anchors)

- Orbits: `src/physics/kepler.ts`, `src/sim/orbits.ts`
- Kinematics: `src/sim/kinematics.ts`
- N-body: `src/sim/dynamics.ts`
- Relativity: `src/physics/relativity.ts`
- Transit integrators: `src/photometry/*`, `src/sim/transitFlux.ts`
