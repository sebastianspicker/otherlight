/**
 * Owns report Learner Response support within the didactics layer. Keeps learning-flow behavior independent of simulation execution.
 */
export function appendLearnerResponse(lines: string[], label: string, response: string | undefined): void {
  if (!response) return;

  let longestBacktickRun = 0;
  for (const [run] of response.matchAll(/`+/g)) {
    longestBacktickRun = Math.max(longestBacktickRun, run.length);
  }
  const fence = "`".repeat(Math.max(3, longestBacktickRun + 1));
  lines.push(`  - ${label}:`);
  lines.push(fence);
  lines.push(response);
  lines.push(fence);
}
