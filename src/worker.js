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

function withSecurityHeaders(response, env, { headRequest = false } = {}) {
  const headers = new Headers(response.headers);
  const contentType = headers.get("Content-Type") || "";
  const isHtmlResponse = contentType.includes("text/html");
  const supabaseOrigin = parseSupabaseOrigin(env?.SUPABASE_URL);

  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(supabaseOrigin));

  if (!isHtmlResponse || headRequest) {
    return new Response(headRequest ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  headers.delete("Content-Length");

  return new Response(
    injectConfigScript(response, {
      SUPABASE_URL: typeof env?.SUPABASE_URL === "string" ? env.SUPABASE_URL : "",
      SUPABASE_PUBLISHABLE_KEY: typeof env?.SUPABASE_PUBLISHABLE_KEY === "string" ? env.SUPABASE_PUBLISHABLE_KEY : "",
      ENTITLEMENTS_API_ENABLED: false,
    }),
    {
      status: response.status,
      statusText: response.statusText,
      headers,
    },
  );
}

function parseSupabaseOrigin(supabaseUrl) {
  if (!supabaseUrl || typeof supabaseUrl !== "string") return null;
  try {
    return new URL(supabaseUrl).origin;
  } catch {
    return null;
  }
}

function buildContentSecurityPolicy(supabaseOrigin) {
  const connectSrc = [
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ];

  if (supabaseOrigin) connectSrc.push(supabaseOrigin);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
    "style-src 'self'",
    "img-src 'self' data: https://www.google-analytics.com",
    `connect-src ${connectSrc.join(" ")}`,
  ].join("; ");
}

function injectConfigScript(response, config) {
  const serializedConfig = JSON.stringify(config);
  const configScript = `<script>window.CREDITCOMBO_CONFIG=${serializedConfig};</script>`;

  return new HTMLRewriter()
    .on("head", {
      element(element) {
        element.append(configScript, { html: true });
      },
    })
    .transform(response).body;
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
      return withSecurityHeaders(assetResponse, env, {
        headRequest: request.method === "HEAD",
      });
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withSecurityHeaders(assetResponse, env, {
      headRequest: request.method === "HEAD",
    });
  },
};
