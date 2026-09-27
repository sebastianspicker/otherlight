/* global URL */
/** Validates contract documents against the repository's supported schema subset. */
import {
  validateArray,
  validateCombinators,
  validateNumber,
  validateRecord,
  validateSimpleKeywords,
  validateString,
} from "./contract-validator-keywords.mjs";

const object = (value) => typeof value === "object" && value !== null && !Array.isArray(value);
const draft = "https://json-schema.org/draft/2020-12/schema";

export class ContractValidator {
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
    let valid = validateSimpleKeywords(this, schema, value, location);
    valid = validateCombinators(this, schema, value, base, location) && valid;
    valid = this.validateValueKeywords(schema, value, base, location) && valid;
    return valid;
  }

  validateValueKeywords(schema, value, base, location) {
    let valid = true;
    if (object(value)) valid = validateRecord(this, schema, value, base, location) && valid;
    if (Array.isArray(value)) valid = validateArray(this, schema, value, base, location) && valid;
    if (typeof value === "number") valid = validateNumber(this, schema, value, location) && valid;
    if (typeof value === "string") valid = validateString(this, schema, value, location) && valid;
    return valid;
  }

  fail(location, message) {
    this.errors.push(`${location || "/"} ${message}`);
    return false;
  }
}
