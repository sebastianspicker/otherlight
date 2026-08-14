/** Direction-safe selection for anchor-relative N-body cache bases. */
import { ANCHOR_TIME_SEC, type NBodyCacheEntry } from "./types";

export function findAnchorIntervalBase(entries: NBodyCacheEntry[], t: number): NBodyCacheEntry | null {
  let best: NBodyCacheEntry | null = null;

  for (const entry of entries) {
    if (!isOnAnchorInterval(entry.t, t)) continue;
    if (best === null || isBetterAnchorBase(entry.t, best.t, t)) {
      best = entry;
    }
  }

  if (best) best.lastAccess = Date.now();
  return best;
}

export function isOnAnchorInterval(entryTime: number, targetTime: number): boolean {
  if (targetTime === ANCHOR_TIME_SEC) return entryTime === ANCHOR_TIME_SEC;
  const lowerBound = Math.min(ANCHOR_TIME_SEC, targetTime);
  const upperBound = Math.max(ANCHOR_TIME_SEC, targetTime);
  return entryTime >= lowerBound && entryTime <= upperBound;
}

export function isBetterAnchorBase(candidateTime: number, currentTime: number, targetTime: number): boolean {
  if (targetTime === ANCHOR_TIME_SEC) return true;
  return targetTime > ANCHOR_TIME_SEC ? candidateTime > currentTime : candidateTime < currentTime;
}
