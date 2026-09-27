/** Applies JSON Pointer mutations to contract test documents. */
function documentAtPointer(document, pointer) {
  const parts = pointer
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"));
  const key = parts.pop();
  let target = document;
  for (const part of parts) target = target[part];
  return [target, key];
}

export function applyCaseMutation(source, mutation) {
  const document = JSON.parse(JSON.stringify(source));
  for (const [pointer, value] of Object.entries(mutation.set ?? {})) {
    const [target, key] = documentAtPointer(document, pointer);
    target[key] = value;
  }
  for (const pointer of mutation.delete ?? []) {
    const [target, key] = documentAtPointer(document, pointer);
    delete target[key];
  }
  return document;
}
