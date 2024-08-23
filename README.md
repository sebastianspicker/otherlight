# Exoplanet and Exomoon Simulation

This project simulates the orbital motion of an exoplanet and its moon around a star, with a focus on how these movements affect the observed light curve from a distant observer's perspective. The simulation allows for adjustments of various parameters such as the mass, inclination, and speed of the planet and moon, as well as the star's luminosity.

## Features

- **Orbital Simulation**: Simulates the elliptical orbits of a planet and its moon around a star.
- **Light Curve Generation**: Generates and displays the light curve based on the transit events of the planet and the moon.
- **Adjustable Parameters**: Allows the user to adjust parameters such as mass, inclination, and speed of the celestial bodies.
- **Zoom and Pan**: Includes x-y zoom controls for better analysis of the light curve.

[View the Exoplanet Simulation](./index.html)

## Known Issues

- **XY-XZ Plane Representation**: The rendering of planets in the XY and XZ planes, as well as the corresponding light curve, is not entirely accurate and needs improvement.
- **Unrealistic Moon Orbits**: The simulation does not prevent unrealistic orbital paths, such as the moon flying through the star when certain inclinations are set.
- **Zoom and Light Curve Display**: The x-y zoom functionality and the overall display of the light curve are not optimal and may need refinement.
- **Incomplete Albedo Representation**: The simulation does not fully account for the reflection (albedo) effects of the planet and moon.
- **Normalization Issue**: The light curve normalization is based on the maximum luminosity of an O-class star, not the currently selected star's luminosity.

## Description

### What the Simulation Shows

This simulation visualizes the dynamics of an exoplanet-exomoon system, focusing on how their transits across a star affect the observed light curve. The key aspects demonstrated by this simulation include:

- **Transit Events**: When the planet or moon passes in front of the star, a dip in the light curve is observed. This is due to the reduction in the star's light reaching the observer, a phenomenon widely used in exoplanet detection.
- **Orbital Parameters**: Users can adjust the orbits by changing parameters like the semi-major and semi-minor axes, inclinations in both XY and XZ planes, and the orbital speed. This showcases how different orbital configurations can affect the light curve.
- **Star and Luminosity Effects**: The star's mass and luminosity can be adjusted, affecting the size and brightness of the star in the simulation. The light curve normalization is currently based on an O-class star's maximum brightness, which simplifies the physics but limits the accuracy of the simulation.

### Physical Limitations and Simplifications

- **2D Representation**: The simulation primarily operates in a 2D plane, and while it attempts to simulate the 3D inclinations, the accuracy in representing these movements is limited.
- **Simplified Physics**: The gravitational interactions between the star, planet, and moon are not fully simulated. Instead, their orbits are predefined based on user inputs, without considering the full range of orbital mechanics.
- **Normalization and Albedo**: The current normalization approach assumes a fixed maximum brightness, and the effects of albedo (reflected light) are only partially implemented.

## Getting Started

### Running the Simulation

1. **Clone the Repository**: git clone https://github.com/sebastianspicker/exoplanet-exomoon-simulation.git
2. **Open `index.html` in a Web Browser**:
- Navigate to the cloned directory.
- Open `index.html` in your web browser to start the simulation.

### Dependencies

This simulation is entirely built with HTML, CSS, and JavaScript and does not require any external libraries or frameworks.

## Contributing

Contributions are welcome! If you find any bugs or want to add new features, feel free to submit a pull request.

## License
MIT License. See the `LICENSE` file for more information.
