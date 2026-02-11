import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

/*
(1.) Example app schema demonstrating integration with API keys component.
(2.) Shows how to structure app tables that reference API keys.
(3.) Component tables are isolated and managed by the component itself.

This schema defines the example application's tables. The API keys component
manages its own tables internally (keys, permissions, roles, etc.) which are
isolated from the app's tables. This example shows how to reference keys from
your app tables if needed.
*/

export default defineSchema({
  // Example: API usage logs in your app (separate from component's logs)
  apiRequests: defineTable({
    keyId: v.string(),
    endpoint: v.string(),
    method: v.string(),
    statusCode: v.number(),
    responseTime: v.number(),
    timestamp: v.number(),
  }).index("by_key", ["keyId"]),
  
  // Example: User settings
  users: defineTable({
    email: v.string(),
    name: v.string(),
    createdAt: v.number(),
  }),
});
