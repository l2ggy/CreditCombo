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
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function parseBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null;
  const match = authorizationHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1].trim();
  return token ? token : null;
}

function getSupabaseOrigin(supabaseUrl) {
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).origin;
  } catch {
    return null;
  }
}

function withSecurityHeaders(response, { headRequest = false, supabaseUrl } = {}) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");

  const connectSources = [
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ];

  const supabaseOrigin = getSupabaseOrigin(supabaseUrl);
  if (supabaseOrigin) connectSources.push(supabaseOrigin);

  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "form-action 'self'",
      "object-src 'none'",
      "script-src 'self' 'unsafe-inline' https://www.googletagmanager.com",
      "style-src 'self'",
      "img-src 'self' data: https://www.google-analytics.com",
      `connect-src ${connectSources.join(" ")}`,
    ].join("; "),
  );

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

  return `<script>window.CREDITCOMBO_CONFIG=Object.assign({},window.CREDITCOMBO_CONFIG||{},${JSON.stringify(config)});</script>`;
}

async function injectRuntimeConfigIfHtml(response, env) {
  const contentType = response.headers.get("Content-Type") || "";
  if (!contentType.includes("text/html")) return response;

  const html = await response.text();
  const injection = buildRuntimeConfigScript(env);
  const injectedHtml = html.includes("</head>")
    ? html.replace("</head>", `${injection}</head>`)
    : html.includes("</body>")
      ? html.replace("</body>", `${injection}</body>`)
      : `${html}${injection}`;

  const headers = new Headers(response.headers);
  headers.delete("Content-Length");

  return new Response(injectedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function normalizeEntitlements(row) {
  if (!row) {
    return {
      premium: false,
      premiumUntil: null,
      reason: "no_row",
    };
  }

  const premiumEnabled = row.premium_enabled === true;
  const premiumUntil = row.premium_until || null;

  if (!premiumEnabled) {
    return {
      premium: false,
      premiumUntil,
      reason: "disabled",
    };
  }

  if (premiumUntil) {
    const premiumUntilTimestamp = Date.parse(premiumUntil);
    if (Number.isFinite(premiumUntilTimestamp) && premiumUntilTimestamp <= Date.now()) {
      return {
        premium: false,
        premiumUntil,
        reason: "expired",
      };
    }
  }

  return {
    premium: true,
    premiumUntil,
    reason: "enabled",
  };
}

async function handleEntitlementsApi(request, env) {
  const accessToken = parseBearerToken(request.headers.get("Authorization"));
  if (!accessToken) {
    return jsonResponse(401, {
      authenticated: false,
      error: "Missing or invalid bearer token.",
    });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, {
      authenticated: false,
      error: "Supabase environment is not configured.",
    });
  }

  const userResponse = await fetch(`${env.SUPABASE_URL}/auth/v1/user`, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: env.SUPABASE_PUBLISHABLE_KEY,
    },
  });

  if (!userResponse.ok) {
    return jsonResponse(401, {
      authenticated: false,
      error: "Token validation failed.",
    });
  }

  const userPayload = await userResponse.json();
  const userId = userPayload?.id;

  if (!userId) {
    return jsonResponse(401, {
      authenticated: false,
      error: "Unable to resolve authenticated user.",
    });
  }

  const entitlementResponse = await fetch(
    `${env.SUPABASE_URL}/rest/v1/user_entitlements?user_id=eq.${encodeURIComponent(userId)}&select=user_id,premium_enabled,premium_until&limit=1`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        apikey: env.SUPABASE_SERVICE_ROLE_KEY,
      },
    },
  );

  if (!entitlementResponse.ok) {
    return jsonResponse(502, {
      authenticated: true,
      userId,
      error: "Unable to load entitlements.",
    });
  }

  const rows = await entitlementResponse.json();
  const normalized = normalizeEntitlements(Array.isArray(rows) ? rows[0] : null);

  return jsonResponse(200, {
    authenticated: true,
    userId,
    premium: normalized.premium,
    premiumUntil: normalized.premiumUntil,
    reason: normalized.reason,
  });
}

async function handleApiRequest(request, env, pathname) {
  if (pathname === "/api/me/entitlements" && request.method === "GET") {
    return handleEntitlementsApi(request, env);
  }

  return jsonResponse(404, { error: "Not found" });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      const apiResponse = await handleApiRequest(request, env, url.pathname);
      return withSecurityHeaders(apiResponse, {
        headRequest: request.method === "HEAD",
        supabaseUrl: env.SUPABASE_URL,
      });
    }

    const rewrittenPath = ROOT_PATH_REWRITES[url.pathname];
    const assetRequest = rewrittenPath
      ? new Request(new URL(rewrittenPath, url).toString(), {
        method: "GET",
        headers: request.headers,
      })
      : request;

    const assetResponse = await env.ASSETS.fetch(assetRequest);
    const assetResponseWithConfig = request.method === "HEAD"
      ? assetResponse
      : await injectRuntimeConfigIfHtml(assetResponse, env);

    return withSecurityHeaders(assetResponseWithConfig, {
      headRequest: request.method === "HEAD",
      supabaseUrl: env.SUPABASE_URL,
    });
  },
};
