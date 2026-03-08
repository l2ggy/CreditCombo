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

function runtimeConfigScript(env) {
  const config = {
    SUPABASE_URL: env.SUPABASE_URL || "",
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY || "",
  };
  return `<script>window.RUNTIME_CONFIG=${JSON.stringify(config)};</script>`;
}

async function injectRuntimeConfigIfHtml(response, env, { headRequest = false } = {}) {
  const contentType = response.headers.get("content-type") || "";
  if (headRequest || !contentType.includes("text/html")) return response;

  const html = await response.text();
  const runtimeScript = runtimeConfigScript(env);
  const updatedHtml = html.includes("</head>")
    ? html.replace("</head>", `${runtimeScript}\n</head>`)
    : `${runtimeScript}${html}`;

  const headers = new Headers(response.headers);
  headers.delete("content-length");
  return new Response(updatedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withSecurityHeaders(response, { headRequest = false } = {}) {
  const headers = new Headers(response.headers);
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
      "connect-src 'self' https://www.google-analytics.com https://region1.google-analytics.com https://*.supabase.co wss://*.supabase.co",
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

    if (rewrittenPath) {
      url.pathname = rewrittenPath;
      const assetRequest = new Request(url.toString(), {
        method: "GET",
        headers: request.headers,
      });
      const rawResponse = await env.ASSETS.fetch(assetRequest);
      const responseWithConfig = await injectRuntimeConfigIfHtml(rawResponse, env, { headRequest });
      return withSecurityHeaders(responseWithConfig, { headRequest });
    }

    const rawResponse = await env.ASSETS.fetch(request);
    const responseWithConfig = await injectRuntimeConfigIfHtml(rawResponse, env, { headRequest });
    return withSecurityHeaders(responseWithConfig, { headRequest });
  },
};
