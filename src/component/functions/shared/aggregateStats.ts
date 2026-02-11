import type { Doc } from "../../_generated/dataModel.js";

/*
(1.) Shared utility to aggregate verification logs into usage statistics by outcome code.
(2.) Eliminates the 8-way if-else stats counter duplicated in analytics and scheduled modules.

This function iterates over verification log documents and tallies outcome codes into a
UsageStats-shaped object. Used by getUsageStats, getUsageByOwner, and rollupAnalytics.
*/

export interface UsageStatsAccumulator {
  total: number;
  valid: number;
  rateLimited: number;
  usageExceeded: number;
  expired: number;
  revoked: number;
  disabled: number;
  notFound: number;
}

export function emptyStats(): UsageStatsAccumulator {
  return {
    total: 0,
    valid: 0,
    rateLimited: 0,
    usageExceeded: 0,
    expired: 0,
    revoked: 0,
    disabled: 0,
    notFound: 0,
  };
}

export function tallyLog(stats: UsageStatsAccumulator, code: string): void {
  stats.total++;
  if (code === "VALID") stats.valid++;
  else if (code === "RATE_LIMITED") stats.rateLimited++;
  else if (code === "USAGE_EXCEEDED") stats.usageExceeded++;
  else if (code === "EXPIRED") stats.expired++;
  else if (code === "REVOKED") stats.revoked++;
  else if (code === "DISABLED") stats.disabled++;
  else if (code === "NOT_FOUND") stats.notFound++;
}

export function aggregateVerificationStats(
  logs: Doc<"verificationLogs">[]
): UsageStatsAccumulator {
  const stats = emptyStats();
  for (const log of logs) {
    tallyLog(stats, log.code);
  }
  return stats;
}
