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

function resolveSupabaseOrigin(supabaseUrl) {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).origin;
  } catch {
    return null;
  }
}

function withInjectedPublicConfig(response, env, { headRequest = false } = {}) {
  if (headRequest) return response;

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("text/html")) return response;

  return response.text().then((html) => {
    const configScript = `<script>window.CREDITCOMBO_CONFIG = { SUPABASE_URL: ${JSON.stringify(env.SUPABASE_URL || "")}, SUPABASE_PUBLISHABLE_KEY: ${JSON.stringify(env.SUPABASE_PUBLISHABLE_KEY || "")}, ENTITLEMENTS_API_ENABLED: false };</script>`;
    const updatedHtml = html.includes("</head>")
      ? html.replace("</head>", `${configScript}</head>`)
      : `${configScript}${html}`;

    const headers = new Headers(response.headers);
    headers.delete("content-length");

    return new Response(updatedHtml, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  });
}

function withSecurityHeaders(response, { headRequest = false, supabaseOrigin = null } = {}) {
  const headers = new Headers(response.headers);
  const connectSrc = [
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ];

  if (supabaseOrigin) connectSrc.push(supabaseOrigin);

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
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://cdn.jsdelivr.net",
      "style-src 'self'",
      "img-src 'self' data: https://www.google-analytics.com",
      `connect-src ${connectSrc.join(" ")}`,
    ].join("; "),
  );

  return new Response(headRequest ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const rewrittenPath = ROOT_PATH_REWRITES[url.pathname];
    const headRequest = request.method === "HEAD";
    const supabaseOrigin = resolveSupabaseOrigin(env.SUPABASE_URL);

    if (rewrittenPath) {
      url.pathname = rewrittenPath;
      const assetRequest = new Request(url.toString(), {
        method: "GET",
        headers: request.headers,
      });
      const assetResponse = await env.ASSETS.fetch(assetRequest);
      const responseWithConfig = await withInjectedPublicConfig(assetResponse, env, { headRequest });
      return withSecurityHeaders(responseWithConfig, { headRequest, supabaseOrigin });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    const responseWithConfig = await withInjectedPublicConfig(assetResponse, env, { headRequest });
    return withSecurityHeaders(responseWithConfig, { headRequest, supabaseOrigin });
  },
};
