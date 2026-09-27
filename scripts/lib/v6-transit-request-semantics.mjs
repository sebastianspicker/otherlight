/** Validates cross-field semantics for Science V6 transit timing requests. */
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const addError = (errors, location, message) => errors.push(`${location} ${message}`);

export function validateScienceV6TransitTimingRequest(value, errors) {
  if (!object(value)) return;
  validateTransitWindow(value, errors);
  const { bodies, bodyById } = indexBodies(value, errors);
  validateObserverTarget(value, bodyById, errors);
  validateBarycentricState(bodies, errors);
  validateCollisions(bodies, errors);
  validateStepBudget(value, errors);
  validateObserverVector(value, errors);
  const rowCount = validateTransitSeries(value, bodies, bodyById, errors);
  validateRowBudget(rowCount, errors);
}

function validateTransitWindow(value, errors) {
  const window = value.window;
  if (
    typeof window?.startOffsetSec === "number" &&
    typeof window?.endOffsetSec === "number" &&
    window.endOffsetSec <= window.startOffsetSec
  )
    addError(errors, "/window/endOffsetSec", "must be greater than startOffsetSec");
}

function indexBodies(value, errors) {
  const bodies = Array.isArray(value.scenario?.bodies) ? value.scenario.bodies : [];
  const bodyById = new Map();
  for (const [index, body] of bodies.entries()) {
    if (!object(body) || typeof body.id !== "string") continue;
    if (bodyById.has(body.id)) addError(errors, `/scenario/bodies/${index}/id`, "must be unique");
    bodyById.set(body.id, body);
  }
  return { bodies, bodyById };
}

function validateObserverTarget(value, bodyById, errors) {
  const targetBodyId = value.scenario?.observer?.targetBodyId;
  if (typeof targetBodyId === "string" && !bodyById.has(targetBodyId))
    addError(errors, "/scenario/observer/targetBodyId", "must name a scenario body");
}

function validateBarycentricState(bodies, errors) {
  const totalMass = bodies.reduce(
    (sum, body) => sum + (object(body) && typeof body.massKg === "number" ? body.massKg : 0),
    0,
  );
  if (totalMass <= 0 || !Number.isFinite(totalMass)) return;
  const positionMoment = [0, 0, 0];
  const velocityMoment = [0, 0, 0];
  let positionScale = 0;
  let velocityScale = 0;
  for (const body of bodies) {
    const position = body?.state?.positionM;
    const velocity = body?.state?.velocityMps;
    if (!Array.isArray(position) || !Array.isArray(velocity)) continue;
    positionScale = Math.max(positionScale, Math.hypot(...position));
    velocityScale = Math.max(velocityScale, Math.hypot(...velocity));
    for (let axis = 0; axis < 3; axis += 1) {
      positionMoment[axis] += body.massKg * position[axis];
      velocityMoment[axis] += body.massKg * velocity[axis];
    }
  }
  const positionResidual = Math.hypot(...positionMoment) / totalMass;
  const velocityResidual = Math.hypot(...velocityMoment) / totalMass;
  if (positionResidual > Math.max(1e-3, positionScale * 1e-12))
    addError(errors, "/scenario/bodies", "must have a barycentric position");
  if (velocityResidual > Math.max(1e-9, velocityScale * 1e-12))
    addError(errors, "/scenario/bodies", "must have zero total momentum");
}

function validateCollisions(bodies, errors) {
  for (let left = 0; left < bodies.length; left += 1) {
    for (let right = left + 1; right < bodies.length; right += 1) {
      const leftBody = bodies[left];
      const rightBody = bodies[right];
      const leftPosition = leftBody?.state?.positionM;
      const rightPosition = rightBody?.state?.positionM;
      if (!Array.isArray(leftPosition) || !Array.isArray(rightPosition)) continue;
      const separation = Math.hypot(...rightPosition.map((value, axis) => value - leftPosition[axis]));
      if (separation <= leftBody.radiusM + rightBody.radiusM)
        addError(errors, `/scenario/bodies/${right}`, "must not start in finite-radius contact");
    }
  }
}

function validateStepBudget(value, errors) {
  const window = value.window;
  const maxStepSec = value.scenario?.integrator?.maxStepSec;
  if (
    typeof window?.startOffsetSec !== "number" ||
    typeof window?.endOffsetSec !== "number" ||
    typeof maxStepSec !== "number" ||
    maxStepSec <= 0
  )
    return;
  const minimumSteps =
    Math.ceil(Math.max(0, window.endOffsetSec) / maxStepSec) +
    Math.ceil(Math.max(0, -window.startOffsetSec) / maxStepSec);
  if (minimumSteps > 500000)
    addError(errors, "/scenario/integrator/maxStepSec", "must require at most 500000 accepted steps");
}

function validateObserverVector(value, errors) {
  const lineOfSight = value.scenario?.observer?.lineOfSight;
  if (Array.isArray(lineOfSight) && lineOfSight.length === 3 && lineOfSight.every(Number.isFinite)) {
    const norm = Math.hypot(...lineOfSight);
    if (Math.abs(norm - 1) > 1e-12)
      addError(errors, "/scenario/observer/lineOfSight", "must be a unit vector");
  }
}

function validateTransitSeries(value, bodies, bodyById, errors) {
  let rowCount = 0;
  const ids = new Set();
  const bodyPairs = new Set();
  const window = value.window;
  for (const [index, series] of (Array.isArray(value.series) ? value.series : []).entries()) {
    if (!object(series)) continue;
    validateSeriesIdentity(series, index, ids, bodyById, bodyPairs, errors);
    const ephemeris = series.ephemeris;
    if (!object(ephemeris)) continue;
    if (
      typeof ephemeris.periodSec === "number" &&
      typeof series.referenceDurationT14Sec === "number" &&
      series.referenceDurationT14Sec >= ephemeris.periodSec
    )
      addError(errors, `/series/${index}/referenceDurationT14Sec`, "must be shorter than periodSec");
    rowCount += countSeriesRows(window, ephemeris);
  }
  return rowCount;
}

function validateSeriesIdentity(series, index, ids, bodyById, bodyPairs, errors) {
  if (typeof series.seriesId === "string") {
    if (ids.has(series.seriesId)) addError(errors, `/series/${index}/seriesId`, "must be unique");
    ids.add(series.seriesId);
  }
  const star = bodyById.get(series.starBodyId);
  if (!star || star.kind !== "star")
    addError(errors, `/series/${index}/starBodyId`, "must name a scenario star");
  const occulter = bodyById.get(series.occulterBodyId);
  if (!occulter || !["planet", "moon"].includes(occulter.kind))
    addError(errors, `/series/${index}/occulterBodyId`, "must name a scenario planet or moon");
  if (series.starBodyId === series.occulterBodyId)
    addError(errors, `/series/${index}/occulterBodyId`, "must differ from starBodyId");
  const bodyPair = `${series.starBodyId}\u0000${series.occulterBodyId}`;
  if (bodyPairs.has(bodyPair))
    addError(errors, `/series/${index}`, "must use a unique star and occulter pair");
  bodyPairs.add(bodyPair);
}

function countSeriesRows(window, ephemeris) {
  if (
    typeof window?.startOffsetSec !== "number" ||
    typeof window?.endOffsetSec !== "number" ||
    typeof ephemeris.referenceMidTransitOffsetSec !== "number" ||
    typeof ephemeris.periodSec !== "number" ||
    ephemeris.periodSec <= 0
  )
    return 0;
  return ephemerisCellCount(
    window.startOffsetSec,
    window.endOffsetSec,
    ephemeris.referenceMidTransitOffsetSec,
    ephemeris.periodSec,
  );
}

function ephemerisCellCount(startOffsetSec, endOffsetSec, referenceMidTransitOffsetSec, periodSec) {
  const first = Math.ceil((startOffsetSec - referenceMidTransitOffsetSec) / periodSec);
  const last = Math.ceil((endOffsetSec - referenceMidTransitOffsetSec) / periodSec) - 1;
  return Math.max(0, last - first + 1);
}

function validateRowBudget(rowCount, errors) {
  if (rowCount > 10000)
    addError(errors, "/window", "must span no more than 10000 requested half-open ephemeris cells");
}
