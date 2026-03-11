const API_ENTITLEMENTS_PATH = "/api/me/entitlements";
const HTML_DOCUMENT_ROUTES = new Map([
  ["/", "/index.html"],
  ["/index.html", "/index.html"],
  ["/quick-setup", "/quick-setup.html"],
  ["/quick-setup.html", "/quick-setup.html"],
  ["/cards", "/cards.html"],
  ["/cards.html", "/cards.html"],
  ["/valuations", "/valuations.html"],
  ["/valuations.html", "/valuations.html"],
  ["/about", "/about.html"],
  ["/about.html", "/about.html"],
]);

const ROOT_PATH_REWRITES = {
  "/favicon.ico": "/icons/favicon.ico",
  "/favicon-32x32.png": "/icons/favicon-32x32.png",
  "/apple-touch-icon.png": "/icons/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png": "/icons/apple-touch-icon.png",
  "/safari-pinned-tab.svg": "/icons/safari-pinned-tab.svg",
  "/site.webmanifest": "/icons/site.webmanifest",
  "/icon-192.png": "/icons/icon-192.png",
  "/icon-512.png": "/icons/icon-512.png",
};

function buildRuntimeConfigScript(env) {
  const config = {
    SUPABASE_URL: env.SUPABASE_URL || "",
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY || "",
    ENTITLEMENTS_API_ENABLED: true,
  };

  return `<script>window.CREDITCOMBO_CONFIG=${JSON.stringify(config)};window.__AUTH_CONFIG_INJECTED__=true;</script>`;
}

function injectRuntimeConfigIntoHtml(html, scriptTag) {
  if (html.includes("</head>")) return html.replace("</head>", `${scriptTag}</head>`);
  if (html.includes("</body>")) return html.replace("</body>", `${scriptTag}</body>`);
  return `${html}${scriptTag}`;
}

function isDocumentResponse(pathname, response) {
  if (HTML_DOCUMENT_ROUTES.has(pathname)) return true;
  if (pathname === "/" || pathname.endsWith(".html")) return true;
  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("text/html");
}

function buildContentSecurityPolicy(env) {
  const connectSrc = new Set([
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ]);

  if (typeof env.SUPABASE_URL === "string" && env.SUPABASE_URL) {
    try {
      connectSrc.add(new URL(env.SUPABASE_URL).origin);
    } catch {
      // Ignore malformed SUPABASE_URL so document serving keeps working.
    }
  }

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://esm.sh",
    "style-src 'self'",
    "img-src 'self' data: https://www.google-analytics.com",
    `connect-src ${[...connectSrc].join(" ")}`,
  ].join("; ");
}

function withSecurityHeaders(response, env, { headRequest = false, debugHeader = false } = {}) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(env));
  if (debugHeader) headers.set("X-Auth-Debug", "stage45-v1");

  return new Response(headRequest ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function jsonResponse(payload, status, env, { debugHeader = false } = {}) {
  const response = new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });

  return withSecurityHeaders(response, env, { debugHeader });
}

async function handleEntitlementsApi(request, env) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "method_not_allowed" }, 405, env, { debugHeader: true });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "missing_config", reason: "missing_config" }, 500, env, { debugHeader: true });
  }

  const authHeader = request.headers.get("Authorization") || "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = tokenMatch?.[1]?.trim();

  if (!token) {
    return jsonResponse(
      { authenticated: false, userId: null, premium: false, premiumUntil: null, reason: "missing_token" },
      401,
      env,
      { debugHeader: true },
    );
  }

  const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!userResponse.ok) {
    return jsonResponse(
      { authenticated: false, userId: null, premium: false, premiumUntil: null, reason: "invalid_token" },
      401,
      env,
      { debugHeader: true },
    );
  }

  const userPayload = await userResponse.json();
  const userId = userPayload?.id;
  if (!userId) {
    return jsonResponse(
      { authenticated: false, userId: null, premium: false, premiumUntil: null, reason: "invalid_token" },
      401,
      env,
      { debugHeader: true },
    );
  }

  const entitlementUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_entitlements`);
  entitlementUrl.searchParams.set("user_id", `eq.${userId}`);
  entitlementUrl.searchParams.set("select", "user_id,premium_enabled,premium_until");
  entitlementUrl.searchParams.set("limit", "1");

  const entitlementResponse = await fetch(entitlementUrl.toString(), {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });

  if (!entitlementResponse.ok) {
    return jsonResponse(
      { authenticated: true, userId, premium: false, premiumUntil: null, reason: "backend_failure" },
      502,
      env,
      { debugHeader: true },
    );
  }

  const rows = await entitlementResponse.json();
  const row = Array.isArray(rows) ? rows[0] : null;

  if (!row) {
    return jsonResponse(
      { authenticated: true, userId, premium: false, premiumUntil: null, reason: "no_row" },
      200,
      env,
      { debugHeader: true },
    );
  }

  const premiumEnabled = row.premium_enabled === true;
  const premiumUntil = row.premium_until || null;
  const premiumUntilTime = premiumUntil ? Date.parse(premiumUntil) : null;
  const premiumStillActive = premiumUntilTime === null || Number.isNaN(premiumUntilTime) || premiumUntilTime > Date.now();
  const premium = premiumEnabled && premiumStillActive;

  let reason = "premium";
  if (!premiumEnabled) reason = "disabled";
  else if (premiumUntilTime !== null && !Number.isNaN(premiumUntilTime) && premiumUntilTime <= Date.now()) reason = "expired";

  return jsonResponse(
    { authenticated: true, userId, premium, premiumUntil, reason },
    200,
    env,
    { debugHeader: true },
  );
}

async function handleDocumentRequest(request, env, rewrittenPath) {
  const url = new URL(request.url);
  if (rewrittenPath) url.pathname = rewrittenPath;

  const assetRequest = new Request(url.toString(), {
    method: "GET",
    headers: request.headers,
  });

  const assetResponse = await env.ASSETS.fetch(assetRequest);
  const headRequest = request.method === "HEAD";

  if (!isDocumentResponse(url.pathname, assetResponse)) {
    return withSecurityHeaders(assetResponse, env, { headRequest, debugHeader: true });
  }

  const originalHtml = await assetResponse.text();
  const htmlWithConfig = injectRuntimeConfigIntoHtml(originalHtml, buildRuntimeConfigScript(env));
  const headers = new Headers(assetResponse.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "no-store");

  const htmlResponse = new Response(headRequest ? null : htmlWithConfig, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers,
  });

  return withSecurityHeaders(htmlResponse, env, { headRequest, debugHeader: true });
}

async function handleAssetRequest(request, env) {
  const url = new URL(request.url);
  const rewrittenPath = ROOT_PATH_REWRITES[url.pathname];
  if (rewrittenPath) {
    url.pathname = rewrittenPath;
    request = new Request(url.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.body,
    });
  }

  const assetResponse = await env.ASSETS.fetch(request);
  return withSecurityHeaders(assetResponse, env, {
    headRequest: request.method === "HEAD",
    debugHeader: false,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === API_ENTITLEMENTS_PATH) {
      return handleEntitlementsApi(request, env);
    }

    const documentPath = HTML_DOCUMENT_ROUTES.get(url.pathname);
    if (documentPath) {
      return handleDocumentRequest(request, env, documentPath);
    }

    return handleAssetRequest(request, env);
  },
};
