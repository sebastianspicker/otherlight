/** Implements JSON Schema keyword validation helpers for contract validators. */
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function validateSimpleKeywords(validator, schema, value, location) {
  let valid = true;
  if (schema.const !== undefined && !equal(value, schema.const))
    valid = validator.fail(location, "must equal const") && valid;
  if (Array.isArray(schema.enum) && !schema.enum.some((item) => equal(value, item)))
    valid = validator.fail(location, "must match enum") && valid;
  if (schema.type && !matchesType(schema.type, value))
    valid = validator.fail(location, `must be ${schema.type}`) && valid;
  return valid;
}

export function validateCombinators(validator, schema, value, base, location) {
  let valid = true;
  for (const branch of schema.allOf ?? []) valid = validator.validate(branch, value, base, location) && valid;
  if (schema.if) valid = validateConditional(validator, schema, value, base, location) && valid;
  if (schema.not) valid = validateNot(validator, schema, value, base, location) && valid;
  return valid;
}

function validateConditional(validator, schema, value, base, location) {
  const errors = validator.errors;
  validator.errors = [];
  const matches = validator.validate(schema.if, value, base, location);
  validator.errors = errors;
  const branch = matches ? schema.then : schema.else;
  return branch ? validator.validate(branch, value, base, location) : true;
}

function validateNot(validator, schema, value, base, location) {
  const errors = validator.errors;
  validator.errors = [];
  const matches = validator.validate(schema.not, value, base, location);
  validator.errors = errors;
  return matches ? validator.fail(location, "must not match") : true;
}

export function validateRecord(validator, schema, value, base, location) {
  let valid = true;
  const properties = object(schema.properties) ? schema.properties : {};
  valid = validateRequiredProperties(validator, schema, value, location) && valid;
  valid = validateDeclaredProperties(validator, properties, value, base, location) && valid;
  valid = validateAdditionalProperties(validator, schema, properties, value, base, location) && valid;
  valid = validatePropertyNames(validator, schema, value, base, location) && valid;
  return valid;
}

function validateRequiredProperties(validator, schema, value, location) {
  let valid = true;
  for (const key of schema.required ?? [])
    if (!(key in value)) valid = validator.fail(location, `must include ${key}`) && valid;
  return valid;
}

function validateDeclaredProperties(validator, properties, value, base, location) {
  let valid = true;
  for (const [key, nested] of Object.entries(properties))
    if (key in value) valid = validator.validate(nested, value[key], base, `${location}/${key}`) && valid;
  return valid;
}

function validateAdditionalProperties(validator, schema, properties, value, base, location) {
  let valid = true;
  for (const [key, nested] of Object.entries(value)) {
    if (key in properties) continue;
    valid = validateAdditionalProperty(validator, schema, nested, key, base, location) && valid;
  }
  return valid;
}

function validateAdditionalProperty(validator, schema, value, key, base, location) {
  let valid = true;
  if (schema.additionalProperties === false)
    valid = validator.fail(`${location}/${key}`, "is not allowed") && valid;
  if (object(schema.additionalProperties))
    valid = validator.validate(schema.additionalProperties, value, base, `${location}/${key}`) && valid;
  return valid;
}

function validatePropertyNames(validator, schema, value, base, location) {
  let valid = true;
  if (schema.propertyNames)
    for (const key of Object.keys(value))
      valid = validator.validate(schema.propertyNames, key, base, location) && valid;
  return valid;
}

export function validateArray(validator, schema, value, base, location) {
  let valid = true;
  const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
  valid = validateArrayLimits(validator, schema, value, location) && valid;
  valid = validatePrefixItems(validator, prefix, value, base, location) && valid;
  valid = validateArrayItems(validator, schema, prefix, value, base, location) && valid;
  return valid;
}

function validateArrayLimits(validator, schema, value, location) {
  let valid = true;
  if (Number.isInteger(schema.minItems) && value.length < schema.minItems)
    valid = validator.fail(location, "has too few items") && valid;
  if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems)
    valid = validator.fail(location, "has too many items") && valid;
  if (schema.uniqueItems && new Set(value.map(JSON.stringify)).size !== value.length)
    valid = validator.fail(location, "must be unique") && valid;
  return valid;
}

function validatePrefixItems(validator, prefix, value, base, location) {
  let valid = true;
  prefix.forEach((nested, index) => {
    if (index < value.length)
      valid = validator.validate(nested, value[index], base, `${location}/${index}`) && valid;
  });
  return valid;
}

function validateArrayItems(validator, schema, prefix, value, base, location) {
  let valid = true;
  if (schema.items === false && value.length > prefix.length)
    valid = validator.fail(location, "has disallowed items") && valid;
  if (object(schema.items))
    for (let index = prefix.length; index < value.length; index += 1)
      valid = validator.validate(schema.items, value[index], base, `${location}/${index}`) && valid;
  return valid;
}

export function validateNumber(validator, schema, value, location) {
  let valid = true;
  valid = validateMinimum(validator, schema, value, location) && valid;
  valid = validateMaximum(validator, schema, value, location) && valid;
  valid = validateExclusiveMinimum(validator, schema, value, location) && valid;
  valid = validateExclusiveMaximum(validator, schema, value, location) && valid;
  return valid;
}

function validateMinimum(validator, schema, value, location) {
  return (
    typeof schema.minimum !== "number" ||
    value >= schema.minimum ||
    validator.fail(location, "is below minimum")
  );
}

function validateMaximum(validator, schema, value, location) {
  return (
    typeof schema.maximum !== "number" ||
    value <= schema.maximum ||
    validator.fail(location, "is above maximum")
  );
}

function validateExclusiveMinimum(validator, schema, value, location) {
  return (
    typeof schema.exclusiveMinimum !== "number" ||
    value > schema.exclusiveMinimum ||
    validator.fail(location, "is below exclusive minimum")
  );
}

function validateExclusiveMaximum(validator, schema, value, location) {
  return (
    typeof schema.exclusiveMaximum !== "number" ||
    value < schema.exclusiveMaximum ||
    validator.fail(location, "is above exclusive maximum")
  );
}

export function validateString(validator, schema, value, location) {
  let valid = true;
  valid = validateStringLengths(validator, schema, value, location) && valid;
  valid = validateStringPattern(validator, schema, value, location) && valid;
  valid = validateDateTime(validator, schema, value, location) && valid;
  return valid;
}

function validateStringLengths(validator, schema, value, location) {
  let valid = true;
  if (Number.isInteger(schema.minLength) && value.length < schema.minLength)
    valid = validator.fail(location, "is too short") && valid;
  if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength)
    valid = validator.fail(location, "is too long") && valid;
  return valid;
}

function validateStringPattern(validator, schema, value, location) {
  if (typeof schema.pattern !== "string" || new RegExp(schema.pattern, "u").test(value)) return true;
  return validator.fail(location, "does not match pattern");
}

function validateDateTime(validator, schema, value, location) {
  if (schema.format !== "date-time") return true;
  const valid = /^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) && !Number.isNaN(Date.parse(value));
  return valid || validator.fail(location, "is not a date-time");
}

export function matchesType(type, value) {
  return typeChecks[type]?.(value) ?? false;
}

const typeChecks = {
  object,
  array: Array.isArray,
  string: (value) => typeof value === "string",
  number: (value) => typeof value === "number" && Number.isFinite(value),
  integer: Number.isInteger,
  boolean: (value) => typeof value === "boolean",
};
