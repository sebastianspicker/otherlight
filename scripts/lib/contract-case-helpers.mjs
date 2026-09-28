/** Provides assertions for valid and invalid contract test cases. */
export function assertValid(corpus, schemaPath, label, document) {
  const result = corpus.validate(schemaPath, document);
  if (!result.valid) throw new Error(`${label} does not match its schema: ${result.errors.join("; ")}`);
}

export function assertInvalid(corpus, schemaPath, label, document) {
  const result = corpus.validate(schemaPath, document);
  if (result.valid) throw new Error(`${label} unexpectedly matches its schema.`);
}
