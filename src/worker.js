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

const DOCUMENT_ALIASES = {
  "/": "/index.html",
  "/index.html": "/index.html",
  "/quick-setup": "/quick-setup.html",
  "/quick-setup.html": "/quick-setup.html",
  "/cards": "/cards.html",
  "/cards.html": "/cards.html",
  "/valuations": "/valuations.html",
  "/valuations.html": "/valuations.html",
  "/about": "/about.html",
  "/about.html": "/about.html",
};

const ENTITLEMENTS_API_PATH = "/api/me/entitlements";
const AUTH_DEBUG_STAGE = "stage45-v1";

function deriveSupabaseOrigin(urlValue) {
  if (!urlValue) return null;
  try {
    return new URL(urlValue).origin;
  } catch {
    return null;
  }
}

function withSecurityHeaders(response, env, { headRequest = false, htmlDocument = false, includeDebugHeader = false } = {}) {
  const headers = new Headers(response.headers);
  const supabaseOrigin = deriveSupabaseOrigin(env.SUPABASE_URL);
  const connectSrc = ["'self'", "https://www.google-analytics.com", "https://region1.google-analytics.com"];

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
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com https://esm.sh",
      "style-src 'self'",
      "img-src 'self' data: https://www.google-analytics.com",
      `connect-src ${connectSrc.join(" ")}`,
    ].join("; "),
  );

  if (htmlDocument) headers.set("Cache-Control", "no-store");
  if (includeDebugHeader) headers.set("X-Auth-Debug", AUTH_DEBUG_STAGE);

  return new Response(headRequest ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function buildRuntimeConfigScript(env) {
  const config = {
    SUPABASE_URL: env.SUPABASE_URL || "",
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY || "",
    ENTITLEMENTS_API_ENABLED: true,
  };

  return `<script>window.CREDITCOMBO_CONFIG=${JSON.stringify(config)};window.__AUTH_CONFIG_INJECTED__=true;</script>`;
}

function injectRuntimeConfigIntoHtml(html, scriptTag) {
  const headCloseMatch = html.match(/<\/head>/i);
  if (headCloseMatch?.index != null) {
    return `${html.slice(0, headCloseMatch.index)}${scriptTag}${html.slice(headCloseMatch.index)}`;
  }

  const bodyCloseMatch = html.match(/<\/body>/i);
  if (bodyCloseMatch?.index != null) {
    return `${html.slice(0, bodyCloseMatch.index)}${scriptTag}${html.slice(bodyCloseMatch.index)}`;
  }

  return `${html}${scriptTag}`;
}

function classifyRequest(url) {
  const pathname = url.pathname;
  if (pathname === ENTITLEMENTS_API_PATH) return { type: "api" };

  const mappedDocumentPath = DOCUMENT_ALIASES[pathname];
  if (mappedDocumentPath) return { type: "document", mappedDocumentPath };

  if (pathname === "/" || pathname.endsWith(".html")) {
    return { type: "document", mappedDocumentPath: pathname === "/" ? "/index.html" : pathname };
  }

  return { type: "asset", mappedAssetPath: ROOT_PATH_REWRITES[pathname] || pathname };
}

async function handleDocumentRequest(request, env, mappedDocumentPath) {
  const assetUrl = new URL(request.url);
  assetUrl.pathname = mappedDocumentPath;

  const assetRequest = new Request(assetUrl.toString(), {
    method: "GET",
    headers: request.headers,
  });

  const assetResponse = await env.ASSETS.fetch(assetRequest);
  const contentType = assetResponse.headers.get("content-type") || "";
  const shouldInject = mappedDocumentPath === "/" || mappedDocumentPath.endsWith(".html") || contentType.includes("text/html");

  if (!shouldInject || !assetResponse.ok) {
    return withSecurityHeaders(assetResponse, env, {
      headRequest: request.method === "HEAD",
      htmlDocument: true,
      includeDebugHeader: true,
    });
  }

  const originalHtml = await assetResponse.text();
  const htmlWithConfig = injectRuntimeConfigIntoHtml(originalHtml, buildRuntimeConfigScript(env));

  const responseWithHtml = new Response(htmlWithConfig, {
    status: assetResponse.status,
    statusText: assetResponse.statusText,
    headers: assetResponse.headers,
  });

  return withSecurityHeaders(responseWithHtml, env, {
    headRequest: request.method === "HEAD",
    htmlDocument: true,
    includeDebugHeader: true,
  });
}

function buildJsonResponse(payload, status, env, { includeDebugHeader = false } = {}) {
  const response = new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });

  return withSecurityHeaders(response, env, {
    includeDebugHeader,
  });
}

async function verifySupabaseUser(token, env) {
  const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!userResponse.ok) return null;

  const user = await userResponse.json();
  return user?.id ? user : null;
}

async function fetchEntitlementRow(userId, env) {
  const entitlementUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_entitlements`);
  entitlementUrl.searchParams.set("select", "user_id,premium_enabled,premium_until");
  entitlementUrl.searchParams.set("user_id", `eq.${userId}`);
  entitlementUrl.searchParams.set("limit", "1");

  const entitlementResponse = await fetch(entitlementUrl.toString(), {
    method: "GET",
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      Accept: "application/json",
    },
  });

  if (!entitlementResponse.ok) return { ok: false };

  const rows = await entitlementResponse.json();
  return {
    ok: true,
    row: Array.isArray(rows) ? rows[0] || null : null,
  };
}

function evaluatePremium(row) {
  if (!row) return { premium: false, reason: "no_row", premiumUntil: null };
  if (!row.premium_enabled) return { premium: false, reason: "disabled", premiumUntil: row.premium_until || null };

  if (row.premium_until) {
    const premiumUntilMs = Date.parse(row.premium_until);
    if (Number.isNaN(premiumUntilMs) || premiumUntilMs <= Date.now()) {
      return { premium: false, reason: "expired", premiumUntil: row.premium_until };
    }
  }

  return { premium: true, reason: "active", premiumUntil: row.premium_until || null };
}

async function handleEntitlementsApi(request, env) {
  const missingConfig = !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY;
  if (missingConfig) {
    return buildJsonResponse(
      { authenticated: false, userId: null, premium: false, premiumUntil: null, reason: "missing_env" },
      500,
      env,
      { includeDebugHeader: true },
    );
  }

  const authHeader = request.headers.get("Authorization") || "";
  const tokenMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!tokenMatch) {
    return buildJsonResponse(
      { authenticated: false, userId: null, premium: false, premiumUntil: null, reason: "missing_token" },
      401,
      env,
      { includeDebugHeader: true },
    );
  }

  const token = tokenMatch[1].trim();
  const user = await verifySupabaseUser(token, env);
  if (!user) {
    return buildJsonResponse(
      { authenticated: false, userId: null, premium: false, premiumUntil: null, reason: "invalid_token" },
      401,
      env,
      { includeDebugHeader: true },
    );
  }

  const entitlementLookup = await fetchEntitlementRow(user.id, env);
  if (!entitlementLookup.ok) {
    return buildJsonResponse(
      { authenticated: true, userId: user.id, premium: false, premiumUntil: null, reason: "lookup_failed" },
      502,
      env,
      { includeDebugHeader: true },
    );
  }

  const premiumState = evaluatePremium(entitlementLookup.row);
  return buildJsonResponse(
    {
      authenticated: true,
      userId: user.id,
      premium: premiumState.premium,
      premiumUntil: premiumState.premiumUntil,
      reason: premiumState.reason,
    },
    200,
    env,
    { includeDebugHeader: true },
  );
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const classification = classifyRequest(url);

    if (classification.type === "api") {
      return handleEntitlementsApi(request, env);
    }

    if (classification.type === "document") {
      return handleDocumentRequest(request, env, classification.mappedDocumentPath);
    }

    const assetUrl = new URL(request.url);
    assetUrl.pathname = classification.mappedAssetPath;
    const assetRequest = classification.mappedAssetPath !== url.pathname
      ? new Request(assetUrl.toString(), {
        method: "GET",
        headers: request.headers,
      })
      : request;

    const assetResponse = await env.ASSETS.fetch(assetRequest);
    return withSecurityHeaders(assetResponse, env, {
      headRequest: request.method === "HEAD",
    });
  },
};
