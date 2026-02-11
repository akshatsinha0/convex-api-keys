import { defineApp } from "convex/server";
import apiKeys from "@00akshatsinha00/convex-api-keys/convex.config";

/*
(1.) Example app configuration integrating the API keys component.
(2.) Demonstrates how to install and use the component in a Convex app.
(3.) Component is mounted at components.apiKeys for use in functions.

This configuration file shows the minimal setup required to use the API keys
component. After installation, the component's functions are available via
components.apiKeys.lib.* in your Convex functions.
*/

const app = defineApp();

app.use(apiKeys, {
  name: "apiKeys",
});

export default app;
