import type { MutationCtx } from "../../_generated/server.js";

/*
(1.) Shared rate limit enforcement logic used by both verify and manual rate limit checks.
(2.) Implements sliding window algorithm with automatic bucket creation and reset.

This module extracts the rate limit checking logic into a shared utility to avoid
duplication between the verify function and the standalone checkRateLimit mutation.
The sliding window algorithm tracks request counts in time-based buckets, resetting
when the window expires and creating new buckets for first-time identifiers.
*/

export async function checkAndUpdateRateLimit(
  ctx: MutationCtx,
  identifier: string,
  namespace: string,
  limit: number,
  duration: number,
  now: number
): Promise<{ success: boolean; remaining: number; reset: number }> {
  const bucket = await ctx.db
    .query("rateLimitBuckets")
    .withIndex("by_key_namespace", (q) =>
      q.eq("keyOrOwnerId", identifier).eq("namespace", namespace)
    )
    .first();

  const windowStart = now - duration;

  if (!bucket) {
    await ctx.db.insert("rateLimitBuckets", {
      keyOrOwnerId: identifier,
      namespace,
      windowStart: now,
      count: 1,
      limit,
      duration,
    });

    return { success: true, remaining: limit - 1, reset: now + duration };
  }

  if (bucket.windowStart < windowStart) {
    await ctx.db.patch(bucket._id, { windowStart: now, count: 1 });
    return { success: true, remaining: limit - 1, reset: now + duration };
  }

  if (bucket.count >= limit) {
    return { success: false, remaining: 0, reset: bucket.windowStart + duration };
  }

  await ctx.db.patch(bucket._id, { count: bucket.count + 1 });

  return {
    success: true,
    remaining: limit - bucket.count - 1,
    reset: bucket.windowStart + duration,
  };
}
