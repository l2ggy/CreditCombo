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

function withSecurityHeaders(response, { headRequest = false } = {}) {
  const headers = new Headers(response.headers);
  let supabaseOrigin = "";

  try {
    const configuredUrl = String(headers.get("X-Creditcombo-Supabase-Url") || "").trim();
    if (configuredUrl) supabaseOrigin = new URL(configuredUrl).origin;
  } catch {
    supabaseOrigin = "";
  }

  const connectSrc = [
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
    supabaseOrigin,
  ].filter(Boolean);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://esm.sh",
      "style-src 'self'",
      "img-src 'self' data: https://www.google-analytics.com",
      `connect-src ${connectSrc.join(" ")}`,
    ].join("; "),
  );

  headers.delete("X-Creditcombo-Supabase-Url");

  return new Response(headRequest ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function isHtmlResponse(response) {
  return response.headers.get("content-type")?.toLowerCase().includes("text/html") || false;
}

async function injectFrontendConfig(response, env) {
  if (!isHtmlResponse(response)) return response;

  const html = await response.text();
  const safeConfig = {
    SUPABASE_URL: env.SUPABASE_URL || "",
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY || "",
    ENTITLEMENTS_API_ENABLED: false,
  };
  const script = `<script>window.CREDITCOMBO_CONFIG=${JSON.stringify(safeConfig)};</script>`;

  const body = html.includes("</head>")
    ? html.replace("</head>", `${script}</head>`)
    : `${script}${html}`;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("X-Creditcombo-Supabase-Url", safeConfig.SUPABASE_URL);

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

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
      const responseWithConfig = request.method === "HEAD"
        ? assetResponse
        : await injectFrontendConfig(assetResponse, env);
      return withSecurityHeaders(responseWithConfig, {
        headRequest: request.method === "HEAD",
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const responseWithConfig = request.method === "HEAD"
      ? assetResponse
      : await injectFrontendConfig(assetResponse, env);

    return withSecurityHeaders(responseWithConfig, {
      headRequest: request.method === "HEAD",
    });
  },
};
