// Cloudflare Pages advanced mode. /api/* (including the /api/live WebSocket upgrade) and /mcp
// go to the openhq-api Worker through the API service binding; everything else is a static asset,
// with an SPA fallback to index.html for client-side routes.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === "/api" || path.startsWith("/api/") || path === "/mcp" || path.startsWith("/mcp/")) {
      if (!env.API) {
        return Response.json({ error: "API binding missing", code: "no_api_binding" }, { status: 503 });
      }
      return env.API.fetch(request);
    }
    const res = await env.ASSETS.fetch(request);
    const lastSegment = path.split("/").pop() || "";
    const looksLikeFile = lastSegment.includes(".");
    if (res.status === 404 && !looksLikeFile && (request.method === "GET" || request.method === "HEAD")) {
      const indexUrl = new URL("/", url.origin);
      return env.ASSETS.fetch(new Request(indexUrl.toString(), { method: request.method, headers: request.headers }));
    }
    return res;
  },
};
