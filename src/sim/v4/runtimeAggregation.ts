function addNumericFields(
  item: Record<string, unknown>,
  sums: Map<string, number>,
  counts: Map<string, number>,
): void {
  for (const [key, value] of Object.entries(item)) {
    if (!(typeof value === "number" && Number.isFinite(value))) continue;
    sums.set(key, (sums.get(key) ?? 0) + value);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
}

function averagedNumericFields<T extends Record<string, unknown>>(
  sums: Map<string, number>,
  counts: Map<string, number>,
): Partial<T> {
  const averaged: Record<string, number> = {};
  for (const [key, sum] of sums) {
    averaged[key] = sum / (counts.get(key) ?? 1);
  }
  return averaged as Partial<T>;
}

export function averageNumericFields<T extends Record<string, unknown>>(
  items: Array<T | undefined>,
): Partial<T> | undefined {
  const sums = new Map<string, number>();
  const counts = new Map<string, number>();
  for (const item of items) {
    if (!item) continue;
    addNumericFields(item, sums, counts);
  }
  return sums.size === 0 ? undefined : averagedNumericFields<T>(sums, counts);
}
