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

const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
};

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: JSON_HEADERS,
  });
}

function unauthorizedResponse(message = "Unauthorized") {
  return jsonResponse({ error: message }, 401);
}

function bearerTokenFromRequest(request) {
  const authorizationHeader = request.headers.get("authorization");
  if (!authorizationHeader) return null;

  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token || null;
}

function entitlementFromRow(row) {
  if (!row) {
    return {
      premium: false,
      premiumUntil: null,
      reason: "no_row",
    };
  }

  const premiumEnabled = row.premium_enabled === true;
  const premiumUntil = typeof row.premium_until === "string" ? row.premium_until : null;
  const premiumUntilMs = premiumUntil ? Date.parse(premiumUntil) : NaN;
  const hasValidPremiumUntil = Number.isFinite(premiumUntilMs);
  const hasExpiredPremiumUntil = hasValidPremiumUntil && premiumUntilMs <= Date.now();

  if (!premiumEnabled) {
    return {
      premium: false,
      premiumUntil,
      reason: "disabled",
    };
  }

  if (hasExpiredPremiumUntil) {
    return {
      premium: false,
      premiumUntil,
      reason: "expired",
    };
  }

  return {
    premium: true,
    premiumUntil,
    reason: "enabled",
  };
}

async function fetchAuthenticatedUser(request, env) {
  const accessToken = bearerTokenFromRequest(request);
  if (!accessToken) {
    return { errorResponse: unauthorizedResponse("Missing or malformed bearer token") };
  }

  const authResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!authResponse.ok) {
    return { errorResponse: unauthorizedResponse("Invalid access token") };
  }

  const authUser = await authResponse.json();
  if (!authUser?.id) {
    return { errorResponse: unauthorizedResponse("Invalid access token") };
  }

  return { authUser };
}

async function handleEntitlementsRequest(request, env) {
  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const { authUser, errorResponse } = await fetchAuthenticatedUser(request, env);
  if (errorResponse) return errorResponse;

  const entitlementsUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_entitlements`);
  entitlementsUrl.searchParams.set("user_id", `eq.${authUser.id}`);
  entitlementsUrl.searchParams.set("select", "premium_enabled,premium_until");
  entitlementsUrl.searchParams.set("limit", "1");

  const entitlementResponse = await fetch(entitlementsUrl.toString(), {
    headers: {
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
      authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!entitlementResponse.ok) {
    return jsonResponse({ error: "Failed to load entitlements" }, 502);
  }

  const rows = await entitlementResponse.json();
  const normalizedEntitlement = entitlementFromRow(Array.isArray(rows) ? rows[0] : null);

  return jsonResponse({
    authenticated: true,
    userId: authUser.id,
    premium: normalizedEntitlement.premium,
    premiumUntil: normalizedEntitlement.premiumUntil,
    reason: normalizedEntitlement.reason,
  });
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
      return handleEntitlementsRequest(request, env);
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
