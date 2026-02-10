import { defineApp } from "convex/server";
import convexApiKeys from "@00akshatsinha00/convex-api-keys/convex.config.js";

const app = defineApp();
app.use(convexApiKeys);

export default app;
