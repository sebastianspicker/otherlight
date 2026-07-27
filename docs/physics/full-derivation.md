# Full Physical Description and Derivations

This document has two parts and is path-labelled:

- Part A: Implemented formulas in the repository. Some belong only to the
  compatibility kernel and are not executed by V4.
- Part B: Ideal / complete physical model (not fully implemented here).

Notation:

- Vectors are bold in the text but written as $\mathbf{r}$, $\mathbf{v}$, $\mathbf{n}$ in ASCII.
- The star is at the origin unless otherwise stated.
- $\mu = GM$ is the gravitational parameter in $L^3/T^2$.
- Observer direction $\mathbf{n}_{\mathrm{obs}}$ points from the star toward the observer.
- Angles are radians in the model.

Execution boundary: V4 executes Kepler snapshots and preview photometry. The
compatibility `stepSystem` path contains optional Verlet N-body and relative
LTTE/Shapiro formulas. The local V5 backend currently executes explicit-epoch
Newtonian DOP853 only. The strict V4 `scientific-browser` validation profile
rejects enabled N-body or relativity requests. Interactive V4 may retain those
configuration flags but does not execute the corresponding solvers and marks
them unavailable/not run. See `model-registry.json` for authoritative status,
owner, validity, test, and reference metadata.

## Part A. Implemented formulas, labelled by execution path

### 1. Units and conventions

- Length: meters (SI).
- Time: seconds.
- Angle: radians in physics; UI uses degrees then converts.
- Flux: normalized to a baseline stellar flux near 1.0.

The numerical gravitational constant is the measured CODATA 2022 central
value,

$$G=6.67430\times10^{-11}\ {\rm m^3\,kg^{-1}\,s^{-2}},$$

not an exact definition. The astronomical unit
$1\ {\rm au}=149\,597\,870\,700\ {\rm m}$ and IAU nominal solar radius
$\mathcal R_\odot^{\rm N}=6.957\times10^8\ {\rm m}$ are exact conversion
constants. The repository's solar, Earth, and Jupiter values in kilograms and
its mean planetary radii are labelled conventional measured estimates; they
are not exact IAU nominal masses or equatorial radii. See `src/core/units.ts`
and the CODATA/IAU entries in `../references.bib`.

### 2. Coordinate frames and projection

#### 2.1 Inertial frame

Positions r(t) are in an inertial frame. The sky plane is defined by n_obs:

- $\mathbf{n}_{\mathrm{obs}}$: normalized observer direction (star -> observer)
- A body is "in front of the star" if $\mathbf{r} \cdot \mathbf{n}_{\mathrm{obs}} > 0$.

#### 2.2 Sky-plane projection

Let $\{\mathbf{e}_x, \mathbf{e}_y, \mathbf{e}_z\}$ be an orthonormal basis with $\mathbf{e}_z = \mathbf{n}_{\mathrm{obs}}$ and $\mathbf{e}_x$, $\mathbf{e}_y$ spanning the sky plane.
For any inertial r:

- $x = \mathbf{r} \cdot \mathbf{e}_x$
- $y = \mathbf{r} \cdot \mathbf{e}_y$
- $z = \mathbf{r} \cdot \mathbf{e}_z$

Sky projection returns (x, y, z), where larger z is closer to the observer.

### 3. Keplerian orbits (kinematic mode)

#### 3.1 Elements

Orbit elements are:

- a (semi-major axis), e (eccentricity)
- inc (inclination), $\Omega$ (longitude of ascending node)
- $\omega$ (argument of periapsis)
- period (orbital period), t0 (epoch)

#### 3.2 Mean anomaly

Mean motion:

$n = 2\pi/\mathrm{period}$

Mean anomaly:

$M(t) = n(t - t_0)$

The period-driven preview position uses the declared $n=2\pi/P$. Whenever a
Cartesian position-and-velocity state is requested with a gravitational
parameter, both phase and velocity instead use the same dynamical relation

$$n=\sqrt{\mu/a^3},$$

so a contradictory configured period cannot define the phase while $\mu$
defines the velocity. The V5 adapter additionally requires the declared period
to agree with $2\pi/n$ within its documented rounding tolerance.

#### 3.3 Kepler equation (elliptic)

Solve for eccentric anomaly E:

$M = E - e\sin E$

#### 3.4 True anomaly and radius

$r = a(1 - e\cos E)$
$\nu = \operatorname{atan2}\!\left(\sqrt{1 - e^2}\,\sin E,\ \cos E - e\right)$

#### 3.5 Perifocal position and inertial rotation

Perifocal vector:

$\mathbf{r}_{\mathrm{PQW}} = (r\cos\nu,\ r\sin\nu,\ 0)$

Rotate by $\Omega$, inc, $\omega$ to inertial coordinates
(see src/physics/frames.ts).

### 4. Planet-moon barycentric split (Kepler mode)

If both masses are provided, the planet orbit is interpreted as the
planet-moon barycenter orbit. Let:

- r_bary be barycenter position (from Kepler orbit)
- r_rel be moon position relative to planet (from moon Kepler orbit)
- m_p, m_m be planet and moon masses

Then:

$\mathbf{r}_{\mathrm{planet}} = \mathbf{r}_{\mathrm{bary}} - \left(\frac{m_m}{m_p + m_m}\right)\mathbf{r}_{\mathrm{rel}}$
$\mathbf{r}_{\mathrm{moon}} = \mathbf{r}_{\mathrm{bary}} + \left(\frac{m_p}{m_p + m_m}\right)\mathbf{r}_{\mathrm{rel}}$

#### 4.1 Hill-sphere and empirical satellite-stability diagnostics

For a hierarchical planet-star pair, the semimajor-axis Hill approximation is

$$R_{H,a}=a_p\left(\frac{m_p}{3M_\star}\right)^{1/3}.$$

The separate moon-apoapsis containment warning uses the smaller value at
planetary periapsis, $R_{H,p}=(1-e_p)R_{H,a}$. The Domingos, Winter, and
Yokoyama empirical fits already contain their fitted planet-eccentricity
dependence, so they use $R_{H,a}$ and must not multiply by $(1-e_p)$ again:

$$
a_{E,\mathrm{pro}}=0.4895\left(1-1.0305e_p-0.2738e_s\right)R_{H,a},
$$

$$
a_{E,\mathrm{retro}}=0.9309\left(1-1.0764e_p-0.9812e_s
+0.9446e_pe_s\right)R_{H,a}.
$$

The implementation clamps a negative fitted limit to zero. These are warning
thresholds, not stability proofs: the cited simulations use the restricted
elliptic three-body problem, planet/star mass ratio $10^{-3}$, planet
eccentricity through 0.9, satellite eccentricity through 0.5, and finite
integration horizons. Arbitrary mass ratios, inclinations, resonances, tides,
and long-term chaos require direct dynamical analysis. Accordingly, the runtime
does not assert either fitted threshold outside the cited eccentricity bounds
or outside a 5% rounding band around the sampled mass ratio; it emits
`HILL_FIT_OUT_OF_DOMAIN` instead. The independent moon-apoapsis/Hill-containment
warning remains available because it does not use the empirical fitted limit.

### 5. N-body dynamics (compatibility kernel; not V4)

#### 5.1 Newtonian acceleration

For bodies i and j with positions r_i, r_j:

$\mathbf{a}_i \mathrel{+}= \mu_j\,\frac{\mathbf{r}_j - \mathbf{r}_i}{\lVert \mathbf{r}_j - \mathbf{r}_i \rVert^3}$

This is applied for star, planet, moon, and any perturbers.

#### 5.2 Plummer softening

To avoid singularities:

$\lVert \mathbf{r} \rVert^3 \to (\lVert \mathbf{r} \rVert^2 + \varepsilon^2)^{3/2}$

#### 5.3 Velocity-Verlet integration

Given state (r0, v0), acceleration a0, and timestep dt:

$\mathbf{r}_1 = \mathbf{r}_0 + \mathbf{v}_0\,dt + \tfrac{1}{2}\,\mathbf{a}_0\,dt^2$
$\mathbf{a}_1 = \mathbf{a}(\mathbf{r}_1)$
$\mathbf{v}_1 = \mathbf{v}_0 + \tfrac{1}{2}(\mathbf{a}_0 + \mathbf{a}_1)\,dt$

#### 5.4 Initial conditions from orbit elements

At an anchor time $t_0$:

- Planet-moon barycenter orbit is computed with $\mu = \mu_{\star} + \mu_{\mathrm{planet}} + \mu_{\mathrm{moon}}$.
- Moon relative orbit uses $\mu = \mu_{\mathrm{planet}} + \mu_{\mathrm{moon}}$.
- These are split into planet and moon positions about the barycenter.

Perturbers are initialized from their Kepler elements using $\mu = \mu_{\star} + \mu_{\mathrm{pert}}$.

#### 5.5 System barycenter removal

The full system is shifted so that the mu-weighted center of mass is at the origin:

$\mathbf{r}_{\mathrm{cm}} = \frac{\sum_i \mu_i\,\mathbf{r}_i}{\sum_i \mu_i}$
$\mathbf{v}_{\mathrm{cm}} = \frac{\sum_i \mu_i\,\mathbf{v}_i}{\sum_i \mu_i}$

Then:

$\mathbf{r}_i \leftarrow \mathbf{r}_i - \mathbf{r}_{\mathrm{cm}}$
$\mathbf{v}_i \leftarrow \mathbf{v}_i - \mathbf{v}_{\mathrm{cm}}$

#### 5.6 GR correction (N-body mode)

An approximate star-centric 1PN correction is applied to each body relative to the star.
For each body (relative position r_rel, velocity v_rel):

$$
\mathbf{a}_{\mathrm{GR}} = \frac{\mu_{\star}}{c^2 r^3}\left[\left(\frac{4\mu_{\star}}{r} - \lVert \mathbf{v}_{\mathrm{rel}} \rVert^2\right)\mathbf{r}_{\mathrm{rel}} + 4(\mathbf{r}_{\mathrm{rel}} \cdot \mathbf{v}_{\mathrm{rel}})\mathbf{v}_{\mathrm{rel}}\right]
$$

This is a Schwarzschild 1PN correction for a test body around a central mass.
It is applied in a mass-weighted way between star and body.

### 6. Relativity and timing (compatibility kernel; unavailable in V4/V5 backend)

#### 6.1 Light-time delay (Roemer-like)

For a body at position r (relative to the star):

$\Delta t_{\mathrm{Roemer}} = -\frac{\mathbf{r} \cdot \mathbf{n}_{\mathrm{obs}}}{c}$

#### 6.2 Shapiro delay (point-mass approximation)

For a point mass mu at the origin:

$\Delta t_{\mathrm{Shapiro}} = -\frac{2\mu}{c^3}\,\ln\!\left(\frac{r + z}{r}\right)$

where:

$r = \lVert \mathbf{r} \rVert$
$z = \mathbf{r} \cdot \mathbf{n}_{\mathrm{obs}}$

A minimum transverse impact parameter can be used to regularize the point-mass
singularity. The implemented value is differential and has an arbitrary additive reference.

#### 6.3 Retarded time solve

We solve for t_emit with fixed-point iteration:

$t_{\mathrm{emit}} = t_{\mathrm{obs}} - \Delta t_{\mathrm{Roemer}}(\mathbf{r}(t_{\mathrm{emit}})) - \Delta t_{\mathrm{Shapiro}}(\mathbf{r}(t_{\mathrm{emit}}))$

### 7. GR apsidal precession (Kepler mode)

When not in N-body mode, a per-orbit precession is derived from:

$\Delta\omega = \frac{6\pi\mu}{a(1 - e^2)c^2}$

If a non-zero per-orbit override is given, it is used instead.

### 8. Transit photometry (multiplicative)

#### 8.1 Uniform disk (single occulter)

The star is a uniform disk with radius R. For a single circular occulter:

$F = 1 - \frac{A_{\mathrm{overlap}}}{\pi R^2}$

The circle-circle overlap area (R >= r):

$$
A = R^2\alpha + r^2\beta - \frac{1}{2}\sqrt{(-d+R+r)(d+R-r)(d-R+r)(d+R+r)}
$$

where:

$\alpha = \arccos\!\left(\frac{d^2 + R^2 - r^2}{2dR}\right)$
$\beta = \arccos\!\left(\frac{d^2 + r^2 - R^2}{2dr}\right)$
d is center separation in the sky plane.

#### 8.2 Multiple occulters

For multiple occulters, the union of silhouettes is integrated numerically
using a deterministic midpoint method on the stellar disk.

#### 8.3 Limb darkening

$\mu = \cos\theta = \sqrt{1 - \frac{x^2 + y^2}{R^2}}$

Quadratic:

$I(\mu) = 1 - u_1(1 - \mu) - u_2(1 - \mu)^2$

Three-parameter (reduced Claret):

$I(\mu) = 1 - a_1(1 - \mu^{1/2}) - a_2(1 - \mu) - a_3(1 - \mu^{3/2})$

Four-parameter (Claret):

$I(\mu) = 1 - a_1(1 - \mu^{1/2}) - a_2(1 - \mu) - a_3(1 - \mu^{3/2}) - a_4(1 - \mu^2)$

#### 8.4 Brightness patches (spots/faculae)

Patches are 2D masks on the sky plane. The local intensity is multiplied
by a patch factor f_patch(x,y) based on circular or elliptical membership.

#### 8.5 Oblate bodies and rings

Oblate bodies are projected as ellipses with:

$r_x = R$
$r_y = R(1 - \mathrm{oblateness})$

Rings are projected annuli; an original circular ring of radius r becomes
an ellipse with minor semiaxis $r\lvert\cos(\mathrm{inc})\rvert$.

#### 8.6 Transmissive occulters (atmosphere)

Total transmission is a product:

$T_{\mathrm{total}}(x,y) = \prod_i T_i(\rho_i)$

The attenuated stellar flux is:

$$
F = \frac{\int I(x,y)\,P(x,y)\,T_{\mathrm{total}}(x,y)\,dA}{\int I(x,y)\,P(x,y)\,dA}
$$

The default "exponential halo" uses:

$\tau(\rho) = \tau_0\,\exp\!\left(-\frac{\rho - r_0}{H}\right)$
$T = \exp(-\tau)$

### 9. Phase curves (additive)

#### 9.1 Phase angle

Let:

$\hat{\mathbf{s}} = -\mathbf{r}_{\mathrm{body}}/\lVert \mathbf{r}_{\mathrm{body}} \rVert$ (body -> star)
$\hat{\mathbf{o}} = \mathbf{n}_{\mathrm{obs}}$ (body -> observer)

Then:

$\cos\alpha = \hat{\mathbf{s}} \cdot \hat{\mathbf{o}}$
$\alpha = \arccos\!\left(\hat{\mathbf{s}} \cdot \hat{\mathbf{o}}\right)$

Interpretation:

$\alpha = 0$ full phase
$\alpha = \pi$ new phase

#### 9.2 Reflected light

Lambert law:

$\Phi_L(\alpha) = \frac{\sin\alpha + (\pi - \alpha)\cos\alpha}{\pi}$

Cosine approximation:

$\Phi_C(\alpha) = \frac{1 + \cos\alpha}{2}$

Reflected flux:

$f_{\mathrm{refl}} = A_{\mathrm{refl}}\,\Phi(\alpha)$

With physical scaling enabled:

$A_{\mathrm{refl}} = \mathrm{reflAmp}\left(\frac{R_{\mathrm{body}}}{r}\right)^2$

#### 9.3 Thermal emission

Geometric weight uses the same phase functions for non-constant models:

$f_{\mathrm{therm}} = A_{\mathrm{therm}}\,W(\alpha)$

With physical scaling:

$A_{\mathrm{therm}} = \mathrm{thermAmp}\left(\frac{R_{\mathrm{body}}}{R_{\star}}\right)^2$

#### 9.4 Thermal inertia (1-pole response)

Let $\omega = 2\pi/\mathrm{period}$ and $\tau$ be the thermal timescale.

Define:

$x = \omega\,\tau$
$\mathrm{lag} = \arctan(x)$
$\mathrm{gain} = \frac{1}{\sqrt{1 + x^2}}$

Then the thermal weight is modified by:

$W_{\mathrm{eff}} = r + (1 - r)\,\mathrm{gain}\,W(\operatorname{clamp}(\alpha - \phi_{\mathrm{off}} - \mathrm{lag}, 0, \pi))$

where $r \in [0,1]$ is a redistribution factor.

### 10. Stellar variability (additive)

Phase is computed by either:

$\phi = 2\pi(t - t_0)/\mathrm{period}$

or, for eccentric orbits, by true anomaly.

The variability model is:

$f_{\mathrm{var}} = C + A_{\mathrm{beam}}\sin(\phi + \phi_b) - A_{\mathrm{ellip}}\cos\!\left(2(\phi + \phi_e)\right)$

### 11. Forward scattering (additive)

Henyey-Greenstein phase function:

$$
p(\theta) = \frac{1}{4\pi}\,\frac{1 - g^2}{\left(1 + g^2 - 2g\cos\theta\right)^{3/2}}
$$

The scattering angle $\theta$ is approximated using the body direction and $\mathbf{n}_{\mathrm{obs}}$.

### 12. Mutual events and secondary eclipse (additive terms)

If a body is occulted by another in the sky plane, its additive flux is
reduced by the visible disk fraction. A behind-the-star gate is also applied.

### 13. Measurement layer

#### 13.1 Finite exposure smearing

Flux can be boxcar-averaged around t with N subsamples:

$F_{\mathrm{smear}}(t) = \frac{1}{N}\sum_k F(t + \delta_k)$

#### 13.2 Instrument systematics and noise (summary)

Deterministic trends (additive):

- Roll systematics: $A_{\mathrm{roll}}\sin(2\pi t/P + \phi_0)$
- Linear drift: $\mathrm{slope}\,t$
- Intrapixel modulation: separable sinusoid in (x,y)

Correlated noise (additive):

- OU / AR(1): $x_{t+dt} = x_t\,\exp(-dt/\tau) + \sigma\,\sqrt{1 - \exp(-2dt/\tau)}\,\mathcal{N}(0,1)$
- 1/f bank: sum of OU components with log-spaced taus
- Random walk: $x_{t+dt} = x_t + \sigma_{\mathrm{rw}}\,\sqrt{dt}\,\mathcal{N}(0,1)$

Photon noise:

Flux is converted to electrons:

$N_e = \max\!\left(0,\ F\,\mathrm{throughput}\,\mathrm{electronsPerUnitFlux}\,\mathrm{exposureSec}\right)$

Poisson noise is sampled from N_e; for large N_e a Gaussian approximation is used.

## Part B. Ideal / complete physical model (target)

This section describes a more complete physical model beyond what the
current implementation provides. It is a roadmap for scientific completeness.

### 1. Dynamics

- Generalize the current star + planet + moon + optional-perturber N-body model
  to arbitrary numbers and hierarchies of planets and moons.
- Higher-order GR terms and full post-Newtonian N-body (not implemented).
- Tides, oblateness-driven precession, and spin-orbit coupling.

### 2. Relativity and timing

- Full GR time delay including Shapiro and Einstein delays in a multi-body field.
- Consistent time standards (TT, TDB) and barycentric corrections.
- Relativistic light bending for transit geometry (small for most systems).

### 3. Stellar surface physics

- Physically modeled spots and faculae anchored to a rotating stellar surface.
- Differential rotation, latitude-dependent spot lifetimes, and active regions.
- Granulation noise and power spectral density matched to stellar type.

### 4. Atmospheric transmission and emission

- Radiative transfer through multi-layer atmospheres with wavelength-dependent
  opacity, scattering, and refraction.
- Temperature-pressure profiles and non-isothermal emission.
- Clouds and hazes with Mie or Rayleigh scattering.

### 5. Limb darkening

- Coefficients derived from stellar atmosphere models given Teff, log g, [Fe/H],
  and bandpass, with physical constraints enforced.

### 6. Planet and moon thermal physics

- Energy balance models with insolation, albedo, and heat transport.
- Spatially varying surface temperature and finite heat capacity.
- Thermal phase curves derived from the temperature map, not a geometric weight.

### 7. Instrument models

- Detector read noise, gain, saturation, and non-linearity.
- Time-correlated systematics informed by spacecraft telemetry.
- Pixel response non-uniformity with pointing jitter model.

### 8. Photometry and spectra

- Multi-band photometry and spectroscopy with bandpass integration.
- Wavelength-dependent limb darkening and atmosphere effects.

## References (code anchors)

- Orbits: `src/physics/kepler.ts`, `src/sim/orbits.ts`
- Kinematics: `src/sim/kinematics.ts`
- N-body: `src/sim/dynamics.ts`
- Relativity: `src/physics/relativity.ts`
- Transit integrators: `src/photometry/*`, `src/sim/transitFlux.ts`
