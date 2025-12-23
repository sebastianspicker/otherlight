const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

const lightCurveCanvas = document.getElementById('lightCurveCanvas');
const lightCurveCtx = lightCurveCanvas.getContext('2d');

const xAxisZoomSlider = document.getElementById('xAxisZoom');
const yAxisZoomSlider = document.getElementById('yAxisZoom');

let sunX = canvas.width / 2;
let sunY = canvas.height / 2;

let planetAngle = 0;
let moonAngle = 0;

let lightCurveData = [];
let timeStep = 0; 
let maxLightCurvePoints = lightCurveCanvas.width;

let isRunning = false;
let animationFrameId;

document.getElementById('startStopButton').addEventListener('click', () => {
    isRunning = !isRunning;
    document.getElementById('startStopButton').textContent = isRunning ? 'Stop' : 'Start';
    if (isRunning) {
        update();
    } else {
        cancelAnimationFrame(animationFrameId);
    }
});

document.getElementById('clearButton').addEventListener('click', () => {
    clearCanvas();
    clearLightCurve();
    resetParameters();
});

function update() {
    if (!isRunning) return;

    updateParameters();
    clearCanvas();

    const { planetX, planetY, planetIsBehindSun } = calculatePlanetPosition();
    const { moonX, moonY, moonIsBehindSun } = calculateMoonPosition(planetX, planetY);

    const flux = calculateFlux(planetX, planetY, moonX, moonY, planetIsBehindSun, moonIsBehindSun);
    updateLightCurve(flux);

    drawOrbits();
    drawSun();
    drawPlanetAndMoon(planetX, planetY, planetIsBehindSun, moonX, moonY, moonIsBehindSun);
    drawLightCurve();

    planetAngle += parseFloat(planetSpeed);
    moonAngle += parseFloat(moonSpeed);

    animationFrameId = requestAnimationFrame(update);
}

function updateParameters() {
    sunMass = document.getElementById('sunMass').value;
    sunLuminosity = getLuminosityFromSlider(document.getElementById('sunLuminosity').value);
    planetMass = document.getElementById('planetMass').value;
    planetInclinationXY = document.getElementById('planetInclinationXY').value * (Math.PI / 180);
    planetInclinationXZ = document.getElementById('planetInclinationXZ').value * (Math.PI / 180);
    moonMass = document.getElementById('moonMass').value;
    planetSemiMajorAxis = document.getElementById('planetSemiMajorAxis').value;
    planetSemiMinorAxis = document.getElementById('planetSemiMinorAxis').value;
    moonSemiMajorAxis = document.getElementById('moonSemiMajorAxis').value;
    moonSemiMinorAxis = document.getElementById('moonSemiMinorAxis').value;
    planetSpeed = document.getElementById('planetSpeed').value;
    moonSpeed = document.getElementById('moonSpeed').value;
    moonInclinationXY = document.getElementById('moonInclinationXY').value * (Math.PI / 180);
    moonInclinationXZ = document.getElementById('moonInclinationXZ').value * (Math.PI / 180);
    showMoon = document.getElementById('showMoon').checked;
}

function clearCanvas() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function clearLightCurve() {
    lightCurveData = [];
    lightCurveCtx.clearRect(0, 0, lightCurveCanvas.width, lightCurveCanvas.height);
    timeStep = 0;
}

function resetParameters() {
    document.getElementById('sunMass').value = 50;
    document.getElementById('sunLuminosity').value = 1;
    document.getElementById('planetMass').value = 20;
    document.getElementById('planetInclinationXY').value = 45;
    document.getElementById('planetInclinationXZ').value = 45;
    document.getElementById('moonMass').value = 10;
    document.getElementById('planetSemiMajorAxis').value = 200;
    document.getElementById('planetSemiMinorAxis').value = 100;
    document.getElementById('moonSemiMajorAxis').value = 50;
    document.getElementById('moonSemiMinorAxis').value = 30;
    document.getElementById('planetSpeed').value = 0.02;
    document.getElementById('moonSpeed').value = 0.02;
    document.getElementById('moonInclinationXY').value = 30;
    document.getElementById('moonInclinationXZ').value = 30;
    document.getElementById('showMoon').checked = true;
    xAxisZoomSlider.value = 1;
    yAxisZoomSlider.value = 1;
}

function drawOrbits() {
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    ctx.beginPath();
    ctx.ellipse(sunX, sunY, planetSemiMajorAxis * Math.cos(planetInclinationXZ), planetSemiMinorAxis * Math.cos(planetInclinationXY), 0, 0, Math.PI * 2);
    ctx.stroke();

    if (showMoon) {
        const { planetX, planetY } = calculatePlanetPosition();
        ctx.beginPath();
        ctx.ellipse(planetX, planetY, moonSemiMajorAxis * Math.cos(moonInclinationXZ), moonSemiMinorAxis * Math.cos(moonInclinationXY), 0, 0, Math.PI * 2);
        ctx.stroke();
    }
}

function getLuminosityFromSlider(value) {
    const luminosityMap = [0.0, 0.4, 0.6, 0.8, 1.0, 1.2, 1.4, 1.6];
    return luminosityMap[Math.min(Math.max(Math.round(value), 0), luminosityMap.length - 1)];
}

function getStarColor(luminosity) {
    if (luminosity >= 1.6) {
        return '#0000ff'; // Blue
    } else if (luminosity >= 1.4) {
        return '#00aaff'; // Blue-white
    } else if (luminosity >= 1.2) {
        return '#b0c4de'; // Light blue-white
    } else if (luminosity >= 1.0) {
        return '#ffffe0'; // White-yellow
    } else if (luminosity >= 0.8) {
        return '#ffff00'; // Yellow
    } else if (luminosity >= 0.6) {
        return '#ff8c00'; // Orange
    } else if (luminosity >= 0.4) {
        return '#ff4500'; // Red-orange
    } else {
        return '#ff0000'; // Red
    }
}

function drawSun() {
    const starColor = getStarColor(parseFloat(sunLuminosity));
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunMass / 5, 0, Math.PI * 2);
    ctx.fillStyle = starColor;
    ctx.fill();
}

function calculatePlanetPosition() {
    const planetX = sunX + planetSemiMajorAxis * Math.cos(planetAngle) * Math.cos(planetInclinationXZ);
    const planetY = sunY + planetSemiMinorAxis * Math.sin(planetAngle) * Math.cos(planetInclinationXY);

    const planetIsBehindSun = planetY < sunY && isBehindSun(planetX, planetY, sunX, sunY, sunMass / 5);

    return { planetX, planetY, planetIsBehindSun };
}

function calculateMoonPosition(planetX, planetY) {
    const moonX = planetX + moonSemiMajorAxis * Math.cos(moonAngle) * Math.cos(moonInclinationXZ);
    const moonY = planetY + moonSemiMinorAxis * Math.sin(moonAngle) * Math.cos(moonInclinationXY);

    const moonIsBehindSun = moonY < sunY && isBehindSun(moonX, moonY, sunX, sunY, sunMass / 5);

    return { moonX, moonY, moonIsBehindSun };
}

function isBehindSun(objectX, objectY, sunX, sunY, sunRadius) {
    const distance = Math.hypot(objectX - sunX, objectY - sunY);
    return distance < sunRadius;
}

function calculateFlux(planetX, planetY, moonX, moonY, planetIsBehindSun, moonIsBehindSun) {
    let totalFlux = parseFloat(sunLuminosity);
    const sunRadius = sunMass / 5;
    const planetRadius = planetMass / 5;
    const moonRadius = moonMass / 8;

    if (!planetIsBehindSun && isOverlap(planetX, planetY, sunX, sunY, planetRadius, sunRadius)) {
        totalFlux -= calculateFluxLoss(sunRadius, planetRadius, calculateOverlapArea(planetX, planetY, sunX, sunY, planetRadius, sunRadius));
    }

    if (showMoon && !moonIsBehindSun && isOverlap(moonX, moonY, sunX, sunY, moonRadius, sunRadius)) {
        totalFlux -= calculateFluxLoss(sunRadius, moonRadius, calculateOverlapArea(moonX, moonY, sunX, sunY, moonRadius, sunRadius));
    }

    return totalFlux;
}

function isOverlap(x1, y1, x2, y2, r1, r2) {
    const distance = Math.hypot(x1 - x2, y1 - y2);
    return distance < r1 + r2;
}

function calculateOverlapArea(x1, y1, x2, y2, r1, r2) {
    const d = Math.hypot(x1 - x2, y1 - y2);
    if (d >= r1 + r2) return 0;
    if (d <= Math.abs(r1 - r2)) return Math.PI * Math.min(r1, r2) ** 2;

    const part1 = r1 ** 2 * Math.acos((d ** 2 + r1 ** 2 - r2 ** 2) / (2 * d * r1));
    const part2 = r2 ** 2 * Math.acos((d ** 2 + r2 ** 2 - r1 ** 2) / (2 * d * r2));
    const part3 = 0.5 * Math.sqrt((-d + r1 + r2) * (d + r1 - r2) * (d - r1 + r2) * (d + r1 + r2));

    return part1 + part2 - part3;
}

function calculateFluxLoss(sunRadius, objectRadius, overlapArea) {
    const sunArea = Math.PI * sunRadius ** 2;
    return (overlapArea / sunArea) * parseFloat(sunLuminosity);
}

function updateLightCurve(flux) {
    lightCurveData.push(flux);
    if (lightCurveData.length > maxLightCurvePoints) {
        lightCurveData.shift();
    }
}

function drawPlanetAndMoon(planetX, planetY, planetIsBehindSun, moonX, moonY, moonIsBehindSun) {
    if (!planetIsBehindSun) {
        ctx.beginPath();
        ctx.arc(planetX, planetY, planetMass / 5, 0, Math.PI * 2);
        ctx.fillStyle = '#00ccff';
        ctx.fill();
    }

    if (showMoon && !moonIsBehindSun) {
        ctx.beginPath();
        ctx.arc(moonX, moonY, moonMass / 8, 0, Math.PI * 2);
        ctx.fillStyle = '#aaaaaa';
        ctx.fill();
    }
}

function drawLightCurve() {
    lightCurveCtx.clearRect(0, 0, lightCurveCanvas.width, lightCurveCanvas.height);

    const xAxisZoom = parseFloat(xAxisZoomSlider.value);
    const yAxisZoom = parseFloat(yAxisZoomSlider.value);

    const maxVisiblePoints = Math.floor(maxLightCurvePoints / xAxisZoom);
    const visibleData = lightCurveData.slice(-maxVisiblePoints);

    const starLuminosity = parseFloat(sunLuminosity);

    // Normalize the light curve data based on current star luminosity
    lightCurveCtx.beginPath();
    lightCurveCtx.moveTo(0, lightCurveCanvas.height - (visibleData[0] / starLuminosity) * lightCurveCanvas.height * yAxisZoom);

    for (let i = 1; i < visibleData.length; i++) {
        const x = (i / visibleData.length) * lightCurveCanvas.width;
        const y = lightCurveCanvas.height - (visibleData[i] / starLuminosity) * lightCurveCanvas.height * yAxisZoom;
        lightCurveCtx.lineTo(x, y);
    }

    lightCurveCtx.strokeStyle = 'black';
    lightCurveCtx.stroke();

    // Draw y-axis scaling and horizontal lines
    drawYAxisScaling(starLuminosity, yAxisZoom);

    // Label the axes
    lightCurveCtx.fillStyle = 'black';
    lightCurveCtx.font = '12px Arial';
    lightCurveCtx.fillText('Flux (Brightness)', 10, 15);
    lightCurveCtx.fillText(`Time: ${timeStep}`, lightCurveCanvas.width - 80, 15);
    timeStep++;
}

function drawYAxisScaling(starLuminosity, yAxisZoom) {
    const maxBrightness = 1.2; // Maximum brightness for scaling
    const yStep = 0.2; // Step for each line

    for (let i = 0; i <= maxBrightness; i += yStep) {
        const y = lightCurveCanvas.height - (i / starLuminosity) * lightCurveCanvas.height * yAxisZoom;

        // Draw the horizontal line
        lightCurveCtx.beginPath();
        lightCurveCtx.moveTo(0, y);
        lightCurveCtx.lineTo(lightCurveCanvas.width, y);
        lightCurveCtx.strokeStyle = 'rgba(200, 200, 200, 0.5)'; // Light gray with reduced opacity
        lightCurveCtx.stroke();

        // Draw the y-axis labels
        lightCurveCtx.fillStyle = 'black';
        lightCurveCtx.fillText(i.toFixed(1), 5, y - 5);
    }
}

// Initial canvas setup
ctx.fillStyle = "#000";
ctx.fillRect(0, 0, canvas.width, canvas.height);
drawLightCurve();
