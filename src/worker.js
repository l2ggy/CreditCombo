const ROOT_PATH_REWRITES = {
  "/quick-setup": "/quick-setup.html",
  "/cards": "/cards.html",
  "/valuations": "/valuations.html",
  "/about": "/about.html",

  "/favicon.ico": "/icons/favicon.ico",
  "/favicon-32x32.png": "/icons/favicon-32x32.png",
  "/apple-touch-icon.png": "/icons/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png": "/icons/apple-touch-icon.png",
  "/safari-pinned-tab.svg": "/icons/safari-pinned-tab.svg",
  "/site.webmanifest": "/icons/site.webmanifest",
  "/icon-192.png": "/icons/icon-192.png",
  "/icon-512.png": "/icons/icon-512.png",
};

const API_ENTITLEMENTS_PATH = "/api/me/entitlements";
const HTML_DOCUMENT_PATHS = new Set([
  "/",
  "/index.html",
  "/quick-setup",
  "/quick-setup.html",
  "/cards",
  "/cards.html",
  "/valuations",
  "/valuations.html",
  "/about",
  "/about.html",
]);

const HTML_CACHE_CONTROL = "no-store";
const AUTH_DEBUG_HEADER_VALUE = "stage45-v1";

function buildRuntimeConfigScript(env) {
  const runtimeConfig = {
    SUPABASE_URL: env.SUPABASE_URL ?? "",
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY ?? "",
    ENTITLEMENTS_API_ENABLED: true,
  };

  return `<script>window.CREDITCOMBO_CONFIG=${JSON.stringify(runtimeConfig)};window.__AUTH_CONFIG_INJECTED__=true;<\/script>`;
}

function injectRuntimeConfig(html, scriptTag) {
  const headCloseIndex = html.lastIndexOf("</head>");
  if (headCloseIndex !== -1) return `${html.slice(0, headCloseIndex)}${scriptTag}${html.slice(headCloseIndex)}`;

  const bodyCloseIndex = html.lastIndexOf("</body>");
  if (bodyCloseIndex !== -1) return `${html.slice(0, bodyCloseIndex)}${scriptTag}${html.slice(bodyCloseIndex)}`;

  return `${html}${scriptTag}`;
}

function getSupabaseOrigin(env) {
  try {
    return new URL(env.SUPABASE_URL).origin;
  } catch {
    return null;
  }
}

function contentSecurityPolicy(env) {
  const connectSrc = [
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ];

  const supabaseOrigin = getSupabaseOrigin(env);
  if (supabaseOrigin) connectSrc.push(supabaseOrigin);

  return [
    "default-src 'self'",
    "base-uri 'self'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "object-src 'none'",
    "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://esm.sh",
    "style-src 'self'",
    "img-src 'self' data: https://www.google-analytics.com",
    `connect-src ${connectSrc.join(" ")}`,
  ].join("; ");
}

function withSecurityHeaders(response, env, { headRequest = false, isHtmlDocument = false, includeDebugHeader = false } = {}) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Content-Security-Policy", contentSecurityPolicy(env));

  if (isHtmlDocument) headers.set("Cache-Control", HTML_CACHE_CONTROL);
  if (includeDebugHeader) headers.set("X-Auth-Debug", AUTH_DEBUG_HEADER_VALUE);

  return new Response(headRequest ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function classifyRequest(url) {
  if (url.pathname === API_ENTITLEMENTS_PATH) return "api_entitlements";
  if (HTML_DOCUMENT_PATHS.has(url.pathname)) return "document";
  return "asset";
}

function resolveAssetPath(pathname) {
  return ROOT_PATH_REWRITES[pathname] ?? pathname;
}

function looksLikeHtmlDocument(pathname, contentType = "") {
  if (HTML_DOCUMENT_PATHS.has(pathname) || pathname.endsWith(".html")) return true;
  return contentType.toLowerCase().includes("text/html");
}

function jsonResponse(body, status, includeDebugHeader = false) {
  const headers = new Headers({ "Content-Type": "application/json; charset=utf-8" });
  if (includeDebugHeader) headers.set("X-Auth-Debug", AUTH_DEBUG_HEADER_VALUE);
  return new Response(JSON.stringify(body), { status, headers });
}

async function verifySupabaseUser(env, token) {
  const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!authResponse.ok) return null;

  const user = await authResponse.json();
  return user?.id ? user : null;
}

async function fetchEntitlementRecord(env, userId) {
  const params = new URLSearchParams({
    select: "user_id,premium_enabled,premium_until",
    user_id: `eq.${userId}`,
    limit: "1",
  });

  const entitlementsResponse = await fetch(`${env.SUPABASE_URL}/rest/v1/user_entitlements?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Accept: "application/json",
    },
  });

  if (!entitlementsResponse.ok) throw new Error("Entitlements lookup failed");

  const rows = await entitlementsResponse.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function computePremiumStatus(record) {
  if (!record) return { premium: false, premiumUntil: null, reason: "no_row" };

  const premiumEnabled = record.premium_enabled === true;
  const premiumUntil = record.premium_until ?? null;

  if (!premiumEnabled) {
    return { premium: false, premiumUntil, reason: "disabled" };
  }

  if (!premiumUntil) {
    return { premium: true, premiumUntil: null, reason: "enabled" };
  }

  const premiumUntilMs = Date.parse(premiumUntil);
  if (!Number.isFinite(premiumUntilMs) || premiumUntilMs > Date.now()) {
    return { premium: true, premiumUntil, reason: "enabled" };
  }

  return { premium: false, premiumUntil, reason: "expired" };
}

async function handleEntitlementsApi(request, env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({ error: "missing_env_config" }, 500, true);
  }

  const authorizationHeader = request.headers.get("Authorization") || "";
  if (!authorizationHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "missing_or_invalid_authorization" }, 401, true);
  }

  const token = authorizationHeader.slice("Bearer ".length).trim();
  if (!token) return jsonResponse({ error: "missing_or_invalid_authorization" }, 401, true);

  const user = await verifySupabaseUser(env, token);
  if (!user) return jsonResponse({ error: "auth_failed" }, 401, true);

  try {
    const record = await fetchEntitlementRecord(env, user.id);
    const status = computePremiumStatus(record);

    return jsonResponse(
      {
        authenticated: true,
        userId: user.id,
        premium: status.premium,
        premiumUntil: status.premiumUntil,
        reason: status.reason,
      },
      200,
      true,
    );
  } catch {
    return jsonResponse({ error: "entitlements_lookup_failed" }, 502, true);
  }
}

async function handleHtmlDocument(request, env, url) {
  const assetPath = resolveAssetPath(url.pathname);
  const assetUrl = new URL(url.toString());
  assetUrl.pathname = assetPath;

  const assetRequest = new Request(assetUrl.toString(), {
    method: request.method,
    headers: request.headers,
  });

  const assetResponse = await env.ASSETS.fetch(assetRequest);

  if (request.method === "HEAD") {
    return withSecurityHeaders(assetResponse, env, {
      headRequest: true,
      isHtmlDocument: true,
      includeDebugHeader: true,
    });
  }

  const html = await assetResponse.text();
  const injectedHtml = injectRuntimeConfig(html, buildRuntimeConfigScript(env));
  const injectedResponse = new Response(injectedHtml, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers: assetResponse.headers,
  });

  return withSecurityHeaders(injectedResponse, env, {
    isHtmlDocument: true,
    includeDebugHeader: true,
  });
}

async function handleAssetRequest(request, env, url) {
  const rewrittenPath = resolveAssetPath(url.pathname);
  const assetUrl = new URL(url.toString());
  assetUrl.pathname = rewrittenPath;

  const assetRequest = rewrittenPath === url.pathname
    ? request
    : new Request(assetUrl.toString(), { method: request.method, headers: request.headers });

  const assetResponse = await env.ASSETS.fetch(assetRequest);

  const isHtmlDocument = looksLikeHtmlDocument(rewrittenPath, assetResponse.headers.get("content-type") || "");

  return withSecurityHeaders(assetResponse, env, {
    headRequest: request.method === "HEAD",
    isHtmlDocument,
    includeDebugHeader: isHtmlDocument,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const requestType = classifyRequest(url);

    if (requestType === "api_entitlements") return handleEntitlementsApi(request, env);
    if (requestType === "document") return handleHtmlDocument(request, env, url);
    return handleAssetRequest(request, env, url);
  },
};
