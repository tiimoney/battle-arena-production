// Centralizes the "what's my own public URL" question. In the combined single-host
// deployment (Express serves the built client too), the API and the client share one
// origin, so PUBLIC_URL doubles as CLIENT_ORIGIN unless overridden. Render injects
// RENDER_EXTERNAL_URL automatically, so a fresh deploy needs zero manual URL config.
const port = process.env.PORT ?? "4000";

export const PUBLIC_URL = process.env.PUBLIC_API_URL ?? process.env.RENDER_EXTERNAL_URL ?? `http://localhost:${port}`;

export const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN ?? PUBLIC_URL;

export const IS_PRODUCTION = process.env.NODE_ENV === "production";
