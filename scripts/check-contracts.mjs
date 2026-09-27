#!/usr/bin/env node
/** Validates checked-in JSON contracts using their Draft 2020-12 vocabulary. */
/* global console, process */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { ContractValidator } from "./lib/contract-validator.mjs";
import { validateScienceV6Semantics } from "./lib/v6-semantics.mjs";
import { runV4ContractCases } from "./lib/v4-contract-cases.mjs";
import { runV5ContractCases } from "./lib/v5-contract-cases.mjs";
import { runV6ContractCases } from "./lib/v6-contract-cases.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const contractRoot = path.join(root, "contracts");

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

export async function loadContractCorpus() {
  const documents = new Map(await collect(contractRoot));
  const schemas = new Map([...documents].filter(([name]) => name.endsWith(".schema.json")));
  const validator = new ContractValidator(schemas);
  return {
    documents,
    schemaCount: schemas.size,
    documentCount: documents.size,
    validate(schemaPath, document) {
      const schema = schemas.get(schemaPath);
      if (!schema) throw new Error(`Missing schema ${schemaPath}`);
      validator.errors = [];
      const valid = validator.validate(schema, document, schema.$id);
      validateScienceV6Semantics(schemaPath, document, validator.errors);
      return { valid: valid && validator.errors.length === 0, errors: [...validator.errors] };
    },
  };
}

async function main() {
  const corpus = await loadContractCorpus();
  runV4ContractCases(corpus);
  runV5ContractCases(corpus);
  runV6ContractCases(corpus);
  process.stdout.write(
    `Validated ${corpus.schemaCount} Draft 2020-12 schemas and ${corpus.documentCount} contract JSON files.\n`,
  );
}

if (process.argv[1] === fileURLToPath(import.meta.url))
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
