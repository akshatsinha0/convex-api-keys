import { cronJobs } from "convex/server";
import { internal } from "./_generated/api.js";

/*
(1.) Scheduled functions for automated maintenance tasks including key expiration, analytics rollup, and log cleanup.
(2.) Expiration scanner runs hourly to disable keys past their expiration timestamp.
(3.) Analytics rollup aggregates verification logs into hourly summaries for efficient querying.
(4.) Log cleanup removes old verification logs based on retention policy to manage storage.

These cron jobs implement automated maintenance operations that keep the component running
efficiently without manual intervention. The expiration scanner ensures expired keys are
promptly disabled, preventing unauthorized access. The analytics rollup reduces storage
requirements by aggregating detailed logs into summary statistics while preserving queryable
history. The cleanup job enforces retention policies, removing old logs that are no longer
needed. All operations are designed to run within Convex transaction limits by processing
data in batches and using efficient queries with proper indexes.
*/

const crons = cronJobs();

crons.interval(
  "expire keys",
  { hours: 1 },
  internal.lib.expireKeys,
);

crons.interval(
  "rollup analytics",
  { hours: 1 },
  internal.lib.rollupAnalytics,
);

crons.interval(
  "cleanup logs",
  { hours: 24 },
  internal.lib.cleanupLogs,
);

export default crons;
