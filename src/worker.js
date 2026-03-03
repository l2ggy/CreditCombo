const ROOT_PATH_REWRITES = {
  "/quick-setup": "/quick-setup.html",


  "/favicon.ico": "/icons/favicon.ico",
  "/favicon-32x32.png": "/icons/favicon-32x32.png",
  "/apple-touch-icon.png": "/icons/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png": "/icons/apple-touch-icon.png",
  "/safari-pinned-tab.svg": "/icons/safari-pinned-tab.svg",
  "/site.webmanifest": "/icons/site.webmanifest",
  "/icon-192.png": "/icons/icon-192.png",
  "/icon-512.png": "/icons/icon-512.png",
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const rewrittenPath = ROOT_PATH_REWRITES[url.pathname];

    if (rewrittenPath) {
      url.pathname = rewrittenPath;
      const assetRequest = new Request(url.toString(), {
        method: "GET",
        headers: request.headers,
      });
      const assetResponse = await env.ASSETS.fetch(assetRequest);

      if (request.method === "HEAD") {
        return new Response(null, {
          status: assetResponse.status,
          statusText: assetResponse.statusText,
          headers: assetResponse.headers,
        });
      }

      return assetResponse;
    }

    return env.ASSETS.fetch(request);
  },
};
