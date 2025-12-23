# Exoplanet–Exomoon Simulation

A physically accurate, interactive 2D simulation of a Star-Planet-Moon system. This project focuses on precise orbital mechanics and the generation of synthetic transit light curves using scientific photometric models.

## Major Update: TypeScript Migration

The entire codebase has been migrated from vanilla JavaScript to TypeScript. This transition is a major milestone for the project, ensuring scientific correctness and long-term maintainability.

### Why TypeScript?
*   **Type Safety in Physics:** Strict typing for vectors (`Vec3`) and orbital elements prevents unit mismatch errors and ensures valid mathematical operations.
*   **Robust Architecture:** The project is now structured into clear, decoupled modules (Physics, Photometry, Simulation, Rendering).
*   **Scientific Accuracy:** Interfaces like `OrbitElements` and `SystemParams` enforce the presence of required physical constants, reducing the risk of "silent failures" in the simulation logic.

## Key Features

### Orbital Mechanics
*   **Robust Kepler Solver:** Solves Kepler's Equation ($M = E - e \sin E$) using a damped Newton-Raphson method, stable even at high eccentricities ($e \to 1$).
*   **3D Coordinate Transformations:** Converts orbital elements ($a, e, i, \Omega, \omega$) from the perifocal frame (PQW) to the inertial frame (IJK) and projects them onto the observer's sky plane.
*   **Observer-Centric Projection:** Supports arbitrary observer viewing angles (defaulting to $+Z$), allowing for future 3D visualizations.

### Photometry (Light Curves)
*   **Analytical Transits:** Uses exact circle-circle intersection formulas for single-body transits (fast and precise).
*   **Multi-Body Occultation:** Implements a deterministic grid-based integration for complex scenarios (e.g., Moon transiting the Planet while the Planet transits the Star), preventing "double counting" of blocked flux.
*   **Limb Darkening Ready:** The architecture is prepared to support quadratic limb darkening laws in future updates.

### High-Fidelity Rendering
*   **Retina/HiDPI Support:** The `Canvas2DRenderer` automatically adjusts to the user's `devicePixelRatio` for crisp rendering on 4K/Retina displays.
*   **Real-time Plotting:** Live visualization of the normalized flux (light curve) with auto-scaling buffers.


## Project Structure

The source code is organized into domain-specific modules:

```
src/
├── core/
│   ├── types.ts          # Domain definitions (OrbitElements, SystemParams)
│   └── units.ts          # Constants (DEG2RAD) and math helpers
├── physics/
│   ├── kepler.ts         # Anomaly conversions and Kepler solver
│   ├── frames.ts         # Coordinate transformations (PQW -> Inertial -> Sky)
│   ├── hill.ts           # Hill sphere and stability calculations
│   └── vec3.ts           # Vector algebra utilities
├── photometry/
│   └── transitUniform.ts # Flux calculation (Uniform Disk model)
├── sim/
│   └── sim.ts            # Simulation loop and state management
├── render/
│   └── canvas2d.ts       # HiDPI Canvas renderer and Plotter
├── main.ts               # Entry point, DOM handling, and Animation Loop
└── style.css             # Responsive layout and theming
```

## Getting Started

### Prerequisites
*   Node.js (v16+)
*   npm

### Installation

1.  **Clone the repository:**
    ```
    git clone https://github.com/yourusername/exomoon-sim.git
    cd exomoon-sim
    ```

2.  **Install dependencies:**
    ```
    npm install
    ```

3.  **Run the development server:**
    ```
    npm run dev
    ```
    Open `http://localhost:5173` in your browser.

## Scientific Details

### Keplerian Orbits
The simulation calculates position vectors by solving for the Eccentric Anomaly ($E$) from the Mean Anomaly ($M$) at every time step $t$.
$$M(t) = n \cdot (t - t_0)$$
$$M = E - e \sin(E)$$
The True Anomaly ($\nu$) and radius ($r$) are then derived to locate the body in its orbital plane.

### Transit Photometry
The normalized flux $F$ is calculated by determining the fraction of the stellar disk obscured by silhouetted bodies.
*   **Single Occulter:** $F = 1 - \frac{A_{intersect}}{\pi R_\star^2}$
*   **Multiple Occulters:** A discrete integration grid sums the projected area of the union of all occulters clipped to the stellar disk.

## Future Roadmap
*   [ ] **Limb Darkening:** Implementation of Mandel & Agol (2002) quadratic limb darkening.
*   [ ] **Barycentric Motion:** rigorous integration of the Planet-Moon barycenter.
*   [ ] **Stability Indicators:** Visual warnings when the moon exceeds the Hill stability limit ($a_{moon} \gtrsim 0.5 R_H$).

## License

Distributed under the MIT License. See `LICENSE` for more information.
