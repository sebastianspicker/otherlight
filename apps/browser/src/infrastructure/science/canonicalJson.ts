/** RFC 8785/JCS serialization for cross-language scientific request hashing. */
export function canonicalScientificJson(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "boolean" || typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Canonical JSON does not support non-finite numbers.");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return `[${value.map(canonicalScientificJson).join(",")}]`;
  if (typeof value !== "object") throw new TypeError("Canonical JSON supports only JSON values.");
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalScientificJson(record[key])}`)
    .join(",")}}`;
}
