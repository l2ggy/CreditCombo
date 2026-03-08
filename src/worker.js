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

function jsonResponse(payload, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function extractBearerToken(request) {
  const authorization = request.headers.get("authorization") || "";
  const [scheme, token, ...extraParts] = authorization.trim().split(/\s+/);

  if (scheme !== "Bearer" || !token || extraParts.length > 0) {
    return null;
  }

  return token;
}

async function fetchAuthenticatedUser(token, env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_PUBLISHABLE_KEY) {
    return null;
  }

  const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!authResponse.ok) {
    return null;
  }

  const authUser = await authResponse.json();
  return typeof authUser?.id === "string" ? authUser : null;
}

async function fetchUserEntitlement(userId, env) {
  if (!env?.SUPABASE_URL || !env?.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  const entitlementUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_entitlements`);
  entitlementUrl.searchParams.set("user_id", `eq.${userId}`);
  entitlementUrl.searchParams.set("select", "user_id,premium_enabled,premium_until");
  entitlementUrl.searchParams.set("limit", "1");

  const entitlementResponse = await fetch(entitlementUrl.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });

  if (!entitlementResponse.ok) {
    return null;
  }

  const rows = await entitlementResponse.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

function normalizeEntitlements(userId, entitlementRow) {
  if (!entitlementRow) {
    return {
      authenticated: true,
      userId,
      premium: false,
      premiumUntil: null,
      reason: "no_row",
    };
  }

  const premiumEnabled = entitlementRow.premium_enabled === true;
  const premiumUntil = typeof entitlementRow.premium_until === "string" ? entitlementRow.premium_until : null;
  const premiumUntilTime = premiumUntil ? Date.parse(premiumUntil) : null;
  const premiumExpired = premiumUntilTime !== null && Number.isFinite(premiumUntilTime) ? premiumUntilTime <= Date.now() : false;
  const premium = premiumEnabled && !premiumExpired;

  let reason = "enabled";
  if (!premiumEnabled) {
    reason = "disabled";
  } else if (premiumExpired) {
    reason = "expired";
  }

  return {
    authenticated: true,
    userId,
    premium,
    premiumUntil,
    reason,
  };
}

async function handleEntitlementsRequest(request, env) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const accessToken = extractBearerToken(request);
  if (!accessToken) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const authUser = await fetchAuthenticatedUser(accessToken, env);
  if (!authUser) {
    return jsonResponse({ error: "Unauthorized" }, 401);
  }

  const entitlementRow = await fetchUserEntitlement(authUser.id, env);
  const normalized = normalizeEntitlements(authUser.id, entitlementRow);
  return jsonResponse(normalized, 200);
}

function supabaseOriginFromEnv(env) {
  if (!env?.SUPABASE_URL) return "";
  try {
    return new URL(env.SUPABASE_URL).origin;
  } catch {
    return "";
  }
}

function authConfigScript(env) {
  const publicConfig = {
    SUPABASE_URL: typeof env?.SUPABASE_URL === "string" ? env.SUPABASE_URL : null,
    SUPABASE_PUBLISHABLE_KEY: typeof env?.SUPABASE_PUBLISHABLE_KEY === "string" ? env.SUPABASE_PUBLISHABLE_KEY : null,
    ENTITLEMENTS_API_ENABLED: false,
  };

  return `<script>window.CREDITCOMBO_CONFIG=${JSON.stringify(publicConfig)};</script>`;
}

function withSecurityHeaders(response, { headRequest = false, supabaseOrigin = "" } = {}) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");

  const connectSrcParts = [
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ];

  if (supabaseOrigin) connectSrcParts.push(supabaseOrigin);

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
      `connect-src ${connectSrcParts.join(" ")}`,
    ].join("; "),
  );

  return new Response(headRequest ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function withResponseTransforms(response, request, env) {
  const isHeadRequest = request.method === "HEAD";
  const contentType = response.headers.get("content-type") || "";
  const isHtml = contentType.includes("text/html");

  let transformedResponse = response;
  if (!isHeadRequest && isHtml) {
    const html = await response.text();
    const configInjection = authConfigScript(env);
    const nextHtml = html.includes("</head>")
      ? html.replace("</head>", `${configInjection}</head>`)
      : `${configInjection}${html}`;

    transformedResponse = new Response(nextHtml, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  }

  return withSecurityHeaders(transformedResponse, {
    headRequest: isHeadRequest,
    supabaseOrigin: supabaseOriginFromEnv(env),
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const rewrittenPath = ROOT_PATH_REWRITES[url.pathname];

    if (url.pathname === "/api/me/entitlements") {
      const response = await handleEntitlementsRequest(request, env);
      return withSecurityHeaders(response, {
        headRequest: request.method === "HEAD",
        supabaseOrigin: supabaseOriginFromEnv(env),
      });
    }

    if (rewrittenPath) {
      url.pathname = rewrittenPath;
      const assetRequest = new Request(url.toString(), {
        method: "GET",
        headers: request.headers,
      });
      const assetResponse = await env.ASSETS.fetch(assetRequest);
      return withResponseTransforms(assetResponse, request, env);
    }

    const assetResponse = await env.ASSETS.fetch(request);
    return withResponseTransforms(assetResponse, request, env);
  },
};
