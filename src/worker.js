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

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function readBearerToken(request) {
  const authHeader = request.headers.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match || !match[1]) return null;
  return match[1].trim();
}

function unauthorized(message = "Unauthorized") {
  return jsonResponse(401, {
    error: message,
  });
}

async function fetchAuthenticatedUser(token, env) {
  const response = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${token}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!response.ok) return null;

  const body = await response.json();
  if (!body?.id) return null;
  return body;
}

async function fetchUserEntitlement(userId, env) {
  const params = new URLSearchParams({
    user_id: `eq.${userId}`,
    select: "premium_enabled,premium_until",
    limit: "1",
  });

  const response = await fetch(`${env.SUPABASE_URL}/rest/v1/user_entitlements?${params.toString()}`, {
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });

  if (!response.ok) return null;

  const rows = await response.json();
  if (!Array.isArray(rows) || rows.length === 0) return null;
  return rows[0];
}

function normalizeEntitlement(userId, entitlementRow) {
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
  const premiumUntil = entitlementRow.premium_until || null;
  const premiumUntilDate = premiumUntil ? new Date(premiumUntil) : null;
  const isFutureExpiry = premiumUntilDate instanceof Date && !Number.isNaN(premiumUntilDate.getTime())
    ? premiumUntilDate.getTime() > Date.now()
    : false;

  const premium = premiumEnabled && (premiumUntil === null || isFutureExpiry);

  let reason = "disabled";
  if (premium) {
    reason = "enabled";
  } else if (premiumEnabled && premiumUntil !== null) {
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

async function handleEntitlements(request, env) {
  const token = readBearerToken(request);
  if (!token) {
    return unauthorized("Missing or malformed bearer token");
  }

  const authUser = await fetchAuthenticatedUser(token, env);
  if (!authUser) {
    return unauthorized("Invalid access token");
  }

  const entitlementRow = await fetchUserEntitlement(authUser.id, env);
  return jsonResponse(200, normalizeEntitlement(authUser.id, entitlementRow));
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

    if (url.pathname === "/api/me/entitlements" && request.method === "GET") {
      const response = await handleEntitlements(request, env);
      return withSecurityHeaders(response, {
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
