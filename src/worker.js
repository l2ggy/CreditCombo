const AUTH_DEBUG_HEADER_VALUE = "stage45-v1";
const DOCUMENT_ROUTE_ALIASES = new Map([
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

const STATIC_PATH_REWRITES = {
  "/favicon.ico": "/icons/favicon.ico",
  "/favicon-32x32.png": "/icons/favicon-32x32.png",
  "/apple-touch-icon.png": "/icons/apple-touch-icon.png",
  "/apple-touch-icon-precomposed.png": "/icons/apple-touch-icon.png",
  "/safari-pinned-tab.svg": "/icons/safari-pinned-tab.svg",
  "/site.webmanifest": "/icons/site.webmanifest",
  "/icon-192.png": "/icons/icon-192.png",
  "/icon-512.png": "/icons/icon-512.png",
};

const ENTITLEMENTS_PATH = "/api/me/entitlements";

function classifyRequest(pathname) {
  if (pathname === ENTITLEMENTS_PATH) return "api_entitlements";
  if (DOCUMENT_ROUTE_ALIASES.has(pathname)) return "document";
  return "asset";
}

function buildRuntimeConfigScript(env) {
  const config = {
    SUPABASE_URL: env.SUPABASE_URL || "",
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY || "",
    ENTITLEMENTS_API_ENABLED: true,
  };

  return `<script>window.CREDITCOMBO_CONFIG=${JSON.stringify(config)};window.__AUTH_CONFIG_INJECTED__=true;</script>`;
}

function isHtmlDocumentPath(pathname) {
  return DOCUMENT_ROUTE_ALIASES.has(pathname) || pathname === "/" || pathname.endsWith(".html");
}

function injectRuntimeConfigIntoHtml(html, script) {
  const lower = html.toLowerCase();
  const headIndex = lower.lastIndexOf("</head>");
  if (headIndex >= 0) return `${html.slice(0, headIndex)}${script}${html.slice(headIndex)}`;

  const bodyIndex = lower.lastIndexOf("</body>");
  if (bodyIndex >= 0) return `${html.slice(0, bodyIndex)}${script}${html.slice(bodyIndex)}`;

  return `${html}${script}`;
}

function supabaseOriginFromUrl(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return null;
  }
}

function withSecurityHeaders(response, env, { headRequest = false, authDebug = false } = {}) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");

  const connectSrc = [
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ];

  const supabaseOrigin = supabaseOriginFromUrl(env.SUPABASE_URL);
  if (supabaseOrigin) connectSrc.push(supabaseOrigin);

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

  if (authDebug) headers.set("X-Auth-Debug", AUTH_DEBUG_HEADER_VALUE);

  return new Response(headRequest ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleHtmlDocument(request, env, url) {
  const rewrittenPath = DOCUMENT_ROUTE_ALIASES.get(url.pathname) || url.pathname;
  const assetUrl = new URL(url.toString());
  assetUrl.pathname = rewrittenPath;

  const assetResponse = await env.ASSETS.fetch(new Request(assetUrl.toString(), {
    method: "GET",
    headers: request.headers,
  }));

  const contentType = assetResponse.headers.get("content-type") || "";
  const shouldInject = isHtmlDocumentPath(url.pathname) || contentType.toLowerCase().includes("text/html");

  let response = assetResponse;
  if (shouldInject && request.method !== "HEAD") {
    const html = await assetResponse.text();
    const injectedHtml = injectRuntimeConfigIntoHtml(html, buildRuntimeConfigScript(env));
    const headers = new Headers(assetResponse.headers);
    headers.set("content-type", "text/html; charset=UTF-8");
    response = new Response(injectedHtml, {
      status: assetResponse.status,
      statusText: assetResponse.statusText,
      headers,
    });
  }

  const securedResponse = withSecurityHeaders(response, env, {
    headRequest: request.method === "HEAD",
    authDebug: true,
  });
  const headers = new Headers(securedResponse.headers);
  headers.set("Cache-Control", "no-store");

  return new Response(request.method === "HEAD" ? null : securedResponse.body, {
    status: securedResponse.status,
    statusText: securedResponse.statusText,
    headers,
  });
}

function jsonResponse(body, { status = 200, authDebug = true } = {}) {
  const headers = new Headers({ "content-type": "application/json; charset=UTF-8" });
  if (authDebug) headers.set("X-Auth-Debug", AUTH_DEBUG_HEADER_VALUE);
  return new Response(JSON.stringify(body), { status, headers });
}

function parseBearerToken(request) {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : "";
}

async function verifyUserToken(env, token) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) return null;
  return response.json();
}

async function fetchEntitlementRow(env, userId) {
  const endpoint = new URL(`${env.SUPABASE_URL}/rest/v1/user_entitlements`);
  endpoint.searchParams.set("select", "user_id,premium_enabled,premium_until");
  endpoint.searchParams.set("user_id", `eq.${userId}`);
  endpoint.searchParams.set("limit", "1");

  const response = await fetch(endpoint.toString(), {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Supabase entitlements lookup failed (${response.status}): ${text.slice(0, 200)}`);
  }

  const rows = await response.json();
  return Array.isArray(rows) ? rows[0] || null : null;
}

function computePremiumStatus(row) {
  if (!row) {
    return { premium: false, premiumUntil: null, reason: "no_row" };
  }

  const premiumEnabled = row.premium_enabled === true;
  const premiumUntil = row.premium_until || null;

  if (!premiumEnabled) {
    return { premium: false, premiumUntil, reason: "disabled" };
  }

  if (!premiumUntil) {
    return { premium: true, premiumUntil: null, reason: "premium" };
  }

  const expiresAtMs = Date.parse(premiumUntil);
  if (!Number.isFinite(expiresAtMs)) {
    return { premium: false, premiumUntil, reason: "expired" };
  }

  if (expiresAtMs > Date.now()) {
    return { premium: true, premiumUntil, reason: "premium" };
  }

  return { premium: false, premiumUntil, reason: "expired" };
}

async function handleEntitlementsApi(request, env) {
  const token = parseBearerToken(request);
  if (!token) {
    return jsonResponse({
      authenticated: false,
      userId: null,
      premium: false,
      premiumUntil: null,
      reason: "missing_bearer_token",
    }, { status: 401 });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse({
      authenticated: false,
      userId: null,
      premium: false,
      premiumUntil: null,
      reason: "missing_server_config",
    }, { status: 500 });
  }

  let user;
  try {
    user = await verifyUserToken(env, token);
  } catch {
    user = null;
  }

  if (!user?.id) {
    return jsonResponse({
      authenticated: false,
      userId: null,
      premium: false,
      premiumUntil: null,
      reason: "invalid_token",
    }, { status: 401 });
  }

  try {
    const row = await fetchEntitlementRow(env, user.id);
    const status = computePremiumStatus(row);

    return jsonResponse({
      authenticated: true,
      userId: user.id,
      premium: status.premium,
      premiumUntil: status.premiumUntil,
      reason: status.reason,
    });
  } catch {
    return jsonResponse({
      authenticated: true,
      userId: user.id,
      premium: false,
      premiumUntil: null,
      reason: "entitlement_lookup_failed",
    }, { status: 502 });
  }
}

export default {
  async fetch(request, env) {
    if (!["GET", "HEAD"].includes(request.method)) {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const url = new URL(request.url);
    const routeType = classifyRequest(url.pathname);

    if (routeType === "api_entitlements") {
      return handleEntitlementsApi(request, env);
    }

    if (routeType === "document") {
      return handleHtmlDocument(request, env, url);
    }

    const rewrittenPath = STATIC_PATH_REWRITES[url.pathname];
    const targetRequest = rewrittenPath
      ? new Request(new URL(rewrittenPath, url).toString(), request)
      : request;
    const assetResponse = await env.ASSETS.fetch(targetRequest);
    return withSecurityHeaders(assetResponse, env, { headRequest: request.method === "HEAD" });
  },
};
