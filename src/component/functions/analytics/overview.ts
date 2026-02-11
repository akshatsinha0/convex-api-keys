import { v } from "convex/values";
import { query } from "../../_generated/server.js";

/*
(1.) Namespace-level overview statistics computing key counts and success rates.
(2.) Categorizes keys into active, disabled, expired, and revoked buckets.

This query provides a high-level health dashboard for an entire namespace, counting
key states and calculating verification success rates across all keys in the namespace.
*/

export const getOverallStats = query({
  args: { namespace: v.string() },
  returns: v.object({
    totalKeys: v.number(),
    activeKeys: v.number(),
    disabledKeys: v.number(),
    expiredKeys: v.number(),
    revokedKeys: v.number(),
    totalVerifications: v.number(),
    successRate: v.number(),
  }),
  handler: async (ctx, args) => {
    const keys = await ctx.db
      .query("keys")
      .withIndex("by_namespace", (q) => q.eq("namespace", args.namespace))
      .collect();

    const now = Date.now();
    let activeKeys = 0;
    let disabledKeys = 0;
    let expiredKeys = 0;
    let revokedKeys = 0;

    for (const key of keys) {
      if (key.revokedAt) revokedKeys++;
      else if (!key.enabled) disabledKeys++;
      else if (key.expires && key.expires < now) expiredKeys++;
      else activeKeys++;
    }

    let totalVerifications = 0;
    let successfulVerifications = 0;

    for (const key of keys) {
      const logs = await ctx.db
        .query("verificationLogs")
        .withIndex("by_key_time", (q) => q.eq("keyHash", key.hash))
        .collect();

      totalVerifications += logs.length;
      successfulVerifications += logs.filter((l) => l.success).length;
    }

    const successRate =
      totalVerifications > 0 ? successfulVerifications / totalVerifications : 0;

    return {
      totalKeys: keys.length,
      activeKeys,
      disabledKeys,
      expiredKeys,
      revokedKeys,
      totalVerifications,
      successRate,
    };
  },
});
