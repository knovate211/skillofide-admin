// Time taken on a test: from starting it to handing it in. Per-question time
// (time_spent_ms) is what the candidate spent looking at each question; this is
// the wall clock, which also covers reading the rules, idle time and reloads.

/** Seconds between start and submit, or null while the attempt is running. */
export function secondsTaken(startedAt?: string, submittedAt?: string): number | null {
  if (!startedAt || !submittedAt) return null;
  const s = (new Date(submittedAt).getTime() - new Date(startedAt).getTime()) / 1000;
  return s >= 0 ? Math.round(s) : null;
}

/** "42m 10s", "58s", "1h 02m". */
export function fmtDuration(secs: number): string {
  const s = Math.max(0, Math.round(secs));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${String(s % 60).padStart(2, '0')}s`;
  return `${Math.floor(m / 60)}h ${String(m % 60).padStart(2, '0')}m`;
}

/** Used (nearly) the whole allowance — the timer, not the candidate, ended it. */
export const ranOutOfTime = (secs: number, limitMinutes?: number) =>
  !!limitMinutes && secs >= limitMinutes * 60 - 15;
