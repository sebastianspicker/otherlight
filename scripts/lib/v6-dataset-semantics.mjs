/** Validates cross-field semantics for Science V6 datasets and descriptors. */
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);

const strictlyIncreasing = (values) =>
  Array.isArray(values) && values.every((value, index) => index === 0 || value > values[index - 1]);
const equalLength = (...values) =>
  values.every(Array.isArray) && values.every((value) => value.length === values[0].length);
const addError = (errors, location, message) => errors.push(`${location} ${message}`);

function validatePairedAxis(value, errors, axis, samples) {
  if (Array.isArray(value[axis]) && !strictlyIncreasing(value[axis]))
    addError(errors, `/${axis}`, "must be strictly increasing");
  if (!equalLength(value[axis], value[samples])) addError(errors, `/${samples}`, `must match ${axis} length`);
  if (Array.isArray(value[axis]) && value[axis].length > 100000)
    addError(errors, `/${axis}`, "must contain at most 100000 samples");
}

function validateStellarGrid(value, errors) {
  const { wavelengthM, mu, intensityWm3Sr } = value;
  validateStellarAxes(wavelengthM, mu, errors);
  if (!Array.isArray(wavelengthM) || !Array.isArray(intensityWm3Sr)) return;
  validateStellarRows(intensityWm3Sr, wavelengthM, mu, errors);
  validateStellarGridBudget(wavelengthM, mu, errors);
}

function validateStellarAxes(wavelengthM, mu, errors) {
  if (Array.isArray(wavelengthM) && !strictlyIncreasing(wavelengthM))
    addError(errors, "/wavelengthM", "must be strictly increasing");
  if (Array.isArray(mu) && !strictlyIncreasing(mu)) addError(errors, "/mu", "must be strictly increasing");
}

function validateStellarRows(intensityWm3Sr, wavelengthM, mu, errors) {
  if (wavelengthM.length !== intensityWm3Sr.length)
    addError(errors, "/intensityWm3Sr", "must have one row per wavelengthM sample");
  for (const [index, row] of intensityWm3Sr.entries())
    if (Array.isArray(mu) && (!Array.isArray(row) || row.length !== mu.length))
      addError(errors, `/intensityWm3Sr/${index}`, "must have one value per mu sample");
}

function validateStellarGridBudget(wavelengthM, mu, errors) {
  if (Array.isArray(mu) && wavelengthM.length * mu.length > 100000)
    addError(errors, "/intensityWm3Sr", "must contain at most 100000 samples");
}

export function validateScienceV6Dataset(value, errors) {
  if (!object(value)) return;
  switch (value.kind) {
    case "passband-response":
      validatePairedAxis(value, errors, "wavelengthM", "response");
      break;
    case "stellar-intensity-grid":
      validateStellarGrid(value, errors);
      break;
    case "atmospheric-profile":
      validateAtmosphericProfile(value, errors);
      break;
    case "scattering-phase-function":
      validatePairedAxis(value, errors, "scatteringAngleRad", "phaseFunctionSrInv");
      break;
    case "stellar-variability-psd":
      validatePairedAxis(value, errors, "frequencyHz", "powerSpectralDensityPerHz");
      break;
    default:
      break;
  }
}

function validateAtmosphericProfile(value, errors) {
  if (value.representation === "transmission")
    validatePairedAxis(value, errors, "wavelengthM", "transmission");
  if (value.representation === "effective-radius")
    validatePairedAxis(value, errors, "wavelengthM", "effectiveRadiusM");
}

export function validateScienceV6DatasetDescriptor(value, errors, location = "") {
  if (!object(value)) return;
  if (
    typeof value.id === "string" &&
    typeof value.contentSha256 === "string" &&
    value.id !== `ds-${value.contentSha256}`
  )
    addError(errors, `${location}/id`, "must equal ds- plus contentSha256");
}

export function validateScienceV6ArtifactDescriptor(value, errors, location = "") {
  if (!object(value)) return;
  if (
    typeof value.artifactId === "string" &&
    typeof value.sha256 === "string" &&
    value.artifactId !== `artifact-${value.sha256}`
  )
    addError(errors, `${location}/artifactId`, "must equal artifact- plus sha256");
}

export function validateScienceV6JobDescriptor(value, errors) {
  if (!object(value)) return;
  if (
    typeof value.createdAt === "string" &&
    typeof value.updatedAt === "string" &&
    Date.parse(value.updatedAt) < Date.parse(value.createdAt)
  )
    addError(errors, "/updatedAt", "must not precede createdAt");
}

export function validateScienceV6RunManifest(value, errors) {
  if (!object(value)) return;
  if (
    typeof value.startedAt === "string" &&
    typeof value.completedAt === "string" &&
    Date.parse(value.completedAt) < Date.parse(value.startedAt)
  )
    addError(errors, "/completedAt", "must not precede startedAt");
  validateManifestDatasets(value, errors);
  validateManifestArtifacts(value, errors);
}

function validateManifestDatasets(value, errors) {
  if (!Array.isArray(value.datasets)) return;
  const ids = new Set();
  value.datasets.forEach((dataset, index) => {
    validateScienceV6DatasetDescriptor(dataset, errors, `/datasets/${index}`);
    if (object(dataset) && typeof dataset.id === "string") {
      if (ids.has(dataset.id)) addError(errors, `/datasets/${index}/id`, "must be unique within datasets");
      ids.add(dataset.id);
    }
  });
}

function validateManifestArtifacts(value, errors) {
  if (!Array.isArray(value.artifacts)) return;
  const ids = new Set();
  value.artifacts.forEach((artifact, index) => {
    validateScienceV6ArtifactDescriptor(artifact, errors, `/artifacts/${index}`);
    if (object(artifact) && typeof artifact.artifactId === "string") {
      if (ids.has(artifact.artifactId))
        addError(errors, `/artifacts/${index}/artifactId`, "must be unique within artifacts");
      ids.add(artifact.artifactId);
    }
  });
}
