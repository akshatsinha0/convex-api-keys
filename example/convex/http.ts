import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server.js";
import { components } from "./_generated/api.js";

/*
(1.) HTTP endpoints for API key verification and key listing.
(2.) POST /api/verify accepts Authorization header with API key for verification.
(3.) GET /api/keys lists all keys (requires authentication).

These endpoints demonstrate how to expose API key operations over HTTP. The verify
endpoint extracts the key from the Authorization header and delegates to the
component's verify mutation. The keys endpoint lists all keys in the default namespace.
*/

const http = httpRouter();

http.route({
  path: "/api/verify",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const authHeader = request.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ valid: false, code: "MISSING_KEY", message: "Missing Authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const key = authHeader.slice(7);
    const result = await ctx.runMutation(components.apiKeys.lib.verify, {
      key,
      namespace: "default",
    });

    return new Response(JSON.stringify(result), {
      status: result.valid ? 200 : 403,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

http.route({
  path: "/api/keys",
  method: "GET",
  handler: httpAction(async (ctx) => {
    const keys = await ctx.runQuery(components.apiKeys.lib.listKeys, {
      namespace: "default",
    });

    return new Response(JSON.stringify(keys), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
