#!/usr/bin/env node
/** Validates checked-in JSON contracts using their Draft 2020-12 vocabulary. */
/* global URL, console, process */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractRoot = path.join(root, "contracts");
const draft = "https://json-schema.org/draft/2020-12/schema";
const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const equal = (left, right) => JSON.stringify(left) === JSON.stringify(right);

async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const entryPath = path.join(directory, entry.name);
        if (entry.isDirectory()) return collect(entryPath);
        if (!entry.name.endsWith(".json")) return [];
        try {
          return [[path.relative(contractRoot, entryPath), JSON.parse(await readFile(entryPath, "utf8"))]];
        } catch (error) {
          throw new Error(`${path.relative(root, entryPath)} is not valid JSON: ${String(error)}`, {
            cause: error,
          });
        }
      }),
    )
  )
    .flat()
    .sort(([left], [right]) => left.localeCompare(right));
}

class Validator {
  constructor(schemas) {
    this.schemas = schemas;
    this.errors = [];
    for (const [name, schema] of schemas) {
      if (!object(schema) || schema.$schema !== draft || typeof schema.$id !== "string")
        throw new Error(`${name} must declare Draft 2020-12 and a $id.`);
      this.refs(schema, schema.$id, name);
    }
  }

  refs(node, base, source) {
    if (Array.isArray(node)) return node.forEach((value) => this.refs(value, base, source));
    if (!object(node)) return;
    if (typeof node.$ref === "string") this.resolve(node.$ref, base, source);
    Object.values(node).forEach((value) => this.refs(value, base, source));
  }

  resolve(ref, base, source) {
    let url;
    try {
      url = new URL(ref, base);
    } catch (error) {
      throw new Error(`${source} has invalid $ref ${ref}: ${String(error)}`, { cause: error });
    }
    const [id, fragment = ""] = url.href.split("#");
    const entry = [...this.schemas.values()].find((schema) => schema.$id === id);
    if (!entry) throw new Error(`${source} has dangling $ref ${ref}.`);
    let schema = entry;
    for (const part of fragment.replace(/^\//, "").split("/")) {
      if (!part) continue;
      const key = part.replace(/~1/g, "/").replace(/~0/g, "~");
      if (!object(schema) || !(key in schema)) throw new Error(`${source} has dangling $ref ${ref}.`);
      schema = schema[key];
    }
    return [schema, entry.$id];
  }

  validate(schema, value, base, location = "") {
    if (schema === true) return true;
    if (schema === false || !object(schema)) return this.fail(location, "is disallowed");
    if (typeof schema.$ref === "string") {
      const [target, targetBase] = this.resolve(schema.$ref, base, "validation");
      return this.validate(target, value, targetBase, location);
    }
    let valid = true;
    if (schema.const !== undefined && !equal(value, schema.const))
      valid = this.fail(location, "must equal const") && valid;
    if (Array.isArray(schema.enum) && !schema.enum.some((item) => equal(value, item)))
      valid = this.fail(location, "must match enum") && valid;
    if (schema.type && !this.type(schema.type, value))
      valid = this.fail(location, `must be ${schema.type}`) && valid;
    for (const branch of schema.allOf ?? []) valid = this.validate(branch, value, base, location) && valid;
    if (schema.if) {
      const errors = this.errors;
      this.errors = [];
      const matches = this.validate(schema.if, value, base, location);
      this.errors = errors;
      if (matches && schema.then) valid = this.validate(schema.then, value, base, location) && valid;
      if (!matches && schema.else) valid = this.validate(schema.else, value, base, location) && valid;
    }
    if (schema.not) {
      const errors = this.errors;
      this.errors = [];
      const matches = this.validate(schema.not, value, base, location);
      this.errors = errors;
      if (matches) valid = this.fail(location, "must not match") && valid;
    }
    if (object(value)) valid = this.record(schema, value, base, location) && valid;
    if (Array.isArray(value)) valid = this.array(schema, value, base, location) && valid;
    if (typeof value === "number") valid = this.number(schema, value, location) && valid;
    if (typeof value === "string") valid = this.string(schema, value, location) && valid;
    return valid;
  }

  record(schema, value, base, location) {
    let valid = true;
    const properties = object(schema.properties) ? schema.properties : {};
    for (const key of schema.required ?? [])
      if (!(key in value)) valid = this.fail(location, `must include ${key}`) && valid;
    for (const [key, nested] of Object.entries(properties))
      if (key in value) valid = this.validate(nested, value[key], base, `${location}/${key}`) && valid;
    for (const [key, nested] of Object.entries(value)) {
      if (key in properties) continue;
      if (schema.additionalProperties === false)
        valid = this.fail(`${location}/${key}`, "is not allowed") && valid;
      if (object(schema.additionalProperties))
        valid = this.validate(schema.additionalProperties, nested, base, `${location}/${key}`) && valid;
    }
    if (schema.propertyNames)
      for (const key of Object.keys(value))
        valid = this.validate(schema.propertyNames, key, base, location) && valid;
    return valid;
  }

  array(schema, value, base, location) {
    let valid = true;
    const prefix = Array.isArray(schema.prefixItems) ? schema.prefixItems : [];
    if (Number.isInteger(schema.minItems) && value.length < schema.minItems)
      valid = this.fail(location, "has too few items") && valid;
    if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems)
      valid = this.fail(location, "has too many items") && valid;
    if (schema.uniqueItems && new Set(value.map(JSON.stringify)).size !== value.length)
      valid = this.fail(location, "must be unique") && valid;
    prefix.forEach((nested, index) => {
      if (index < value.length)
        valid = this.validate(nested, value[index], base, `${location}/${index}`) && valid;
    });
    if (schema.items === false && value.length > prefix.length)
      valid = this.fail(location, "has disallowed items") && valid;
    if (object(schema.items))
      for (let index = prefix.length; index < value.length; index += 1)
        valid = this.validate(schema.items, value[index], base, `${location}/${index}`) && valid;
    return valid;
  }

  number(schema, value, location) {
    let valid = true;
    if (typeof schema.minimum === "number" && value < schema.minimum)
      valid = this.fail(location, "is below minimum") && valid;
    if (typeof schema.maximum === "number" && value > schema.maximum)
      valid = this.fail(location, "is above maximum") && valid;
    if (typeof schema.exclusiveMinimum === "number" && value <= schema.exclusiveMinimum)
      valid = this.fail(location, "is below exclusive minimum") && valid;
    if (typeof schema.exclusiveMaximum === "number" && value >= schema.exclusiveMaximum)
      valid = this.fail(location, "is above exclusive maximum") && valid;
    return valid;
  }

  string(schema, value, location) {
    let valid = true;
    if (Number.isInteger(schema.minLength) && value.length < schema.minLength)
      valid = this.fail(location, "is too short") && valid;
    if (Number.isInteger(schema.maxLength) && value.length > schema.maxLength)
      valid = this.fail(location, "is too long") && valid;
    if (typeof schema.pattern === "string" && !new RegExp(schema.pattern, "u").test(value))
      valid = this.fail(location, "does not match pattern") && valid;
    if (
      schema.format === "date-time" &&
      (!/^\d{4}-\d{2}-\d{2}T.+(?:Z|[+-]\d{2}:\d{2})$/.test(value) || Number.isNaN(Date.parse(value)))
    )
      valid = this.fail(location, "is not a date-time") && valid;
    return valid;
  }

  type(type, value) {
    return (
      (type === "object" && object(value)) ||
      (type === "array" && Array.isArray(value)) ||
      (type === "string" && typeof value === "string") ||
      (type === "number" && typeof value === "number" && Number.isFinite(value)) ||
      (type === "integer" && Number.isInteger(value)) ||
      (type === "boolean" && typeof value === "boolean")
    );
  }

  fail(location, message) {
    this.errors.push(`${location || "/"} ${message}`);
    return false;
  }
}

export async function loadContractCorpus() {
  const documents = new Map(await collect(contractRoot));
  const schemas = new Map([...documents].filter(([name]) => name.endsWith(".schema.json")));
  const validator = new Validator(schemas);
  return {
    documents,
    schemaCount: schemas.size,
    documentCount: documents.size,
    validate(schemaPath, document) {
      const schema = schemas.get(schemaPath);
      if (!schema) throw new Error(`Missing schema ${schemaPath}`);
      validator.errors = [];
      const valid = validator.validate(schema, document, schema.$id);
      return { valid, errors: [...validator.errors] };
    },
  };
}

function assertValid(corpus, schemaPath, label, document) {
  const result = corpus.validate(schemaPath, document);
  if (!result.valid) throw new Error(`${label} does not match its schema: ${result.errors.join("; ")}`);
}

async function main() {
  const corpus = await loadContractCorpus();
  const get = (name) => corpus.documents.get(name);
  assertValid(
    corpus,
    "capabilities-v1/manifest.schema.json",
    "capabilities manifest",
    get("capabilities-v1/manifest.json"),
  );
  assertValid(
    corpus,
    "education-v4/fixture-manifest.schema.json",
    "Education V4 parity fixture",
    get("education-v4/fixtures/scoped-parity.json"),
  );
  assertValid(
    corpus,
    "workspace-v1/workspace.schema.json",
    "workspace fixture",
    get("workspace-v1/fixtures/education-workspace.json"),
  );
  const cases = get("science-v5/contract-cases.json");
  assertValid(
    corpus,
    "science-v5/forward-request.schema.json",
    "V5 forward request",
    cases.validForwardRequest,
  );
  assertValid(
    corpus,
    "science-v5/run-manifest-v2.schema.json",
    "V5 run manifest",
    cases.validForwardResult.runManifest,
  );
  const parity = get("science-v5/scipy-dop853-native-parity.json");
  assertValid(corpus, "science-v5/forward-request.schema.json", "V5 parity scenario", {
    kind: "forward",
    scenario: parity.scenario,
    startOffsetSec: 0,
    endOffsetSec: 1,
    sampleCadenceSec: 1,
    outputs: ["radial-velocity"],
    seed: 0,
  });
  process.stdout.write(
    `Validated ${corpus.schemaCount} Draft 2020-12 schemas and ${corpus.documentCount} contract JSON files.\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
