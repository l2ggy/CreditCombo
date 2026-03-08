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

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function unauthorizedResponse(message = "Unauthorized") {
  return jsonResponse({ error: message }, 401);
}

function extractBearerToken(request) {
  const authorizationHeader = request.headers.get("authorization");
  if (!authorizationHeader) return null;

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const token = match[1].trim();
  return token.length > 0 ? token : null;
}

function normalizeEntitlement(entitlementRow, userId) {
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
  const premiumUntil = entitlementRow.premium_until ?? null;
  const premiumUntilTimestamp = premiumUntil ? Date.parse(premiumUntil) : null;
  const hasValidExpiryTimestamp = premiumUntilTimestamp !== null && !Number.isNaN(premiumUntilTimestamp);
  const isExpired = hasValidExpiryTimestamp && premiumUntilTimestamp <= Date.now();
  const premium = premiumEnabled && !isExpired;

  let reason = "disabled";
  if (premiumEnabled && isExpired) {
    reason = "expired";
  } else if (premium) {
    reason = "enabled";
  }

  return {
    authenticated: true,
    userId,
    premium,
    premiumUntil,
    reason,
  };
}

async function validateSupabaseUserToken(token, env) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) return null;

  const user = await response.json();
  if (!user?.id || typeof user.id !== "string") return null;

  return user;
}

async function fetchEntitlementRow(userId, env) {
  const query = new URLSearchParams({
    user_id: `eq.${userId}`,
    select: "user_id,premium_enabled,premium_until",
    limit: "1",
  });

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/user_entitlements?${query.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });

  if (!response.ok) return null;

  const rows = await response.json();
  return Array.isArray(rows) && rows.length > 0 ? rows[0] : null;
}

async function handleEntitlementsRequest(request, env) {
  const token = extractBearerToken(request);
  if (!token) {
    return unauthorizedResponse("Missing or malformed bearer token");
  }

  const user = await validateSupabaseUserToken(token, env);
  if (!user) {
    return unauthorizedResponse("Invalid access token");
  }

  const entitlementRow = await fetchEntitlementRow(user.id, env);
  return jsonResponse(normalizeEntitlement(entitlementRow, user.id));
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

    if (url.pathname === "/api/me/entitlements") {
      if (request.method !== "GET") {
        return jsonResponse({ error: "Method Not Allowed" }, 405);
      }

      const response = await handleEntitlementsRequest(request, env);
      return withSecurityHeaders(response, {
        headRequest: false,
        supabaseOrigin: supabaseOriginFromEnv(env),
      });
    }

    const rewrittenPath = ROOT_PATH_REWRITES[url.pathname];

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
