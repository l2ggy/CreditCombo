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

function parseBearerToken(authorizationHeader) {
  if (typeof authorizationHeader !== "string") return null;
  const [scheme, token, ...rest] = authorizationHeader.trim().split(/\s+/);
  if (rest.length || !scheme || !token) return null;
  if (scheme.toLowerCase() !== "bearer") return null;
  return token;
}

function jsonResponse(status, payload) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
}

function buildRuntimeConfigScript(env) {
  const configPayload = {
    SUPABASE_URL: env.SUPABASE_URL || "",
    SUPABASE_PUBLISHABLE_KEY: env.SUPABASE_PUBLISHABLE_KEY || "",
    ENTITLEMENTS_API_ENABLED: true,
  };

  return `<script>window.CREDITCOMBO_CONFIG=${JSON.stringify(configPayload)};</script>`;
}

function injectConfigIntoHtml(html, env) {
  const runtimeScript = buildRuntimeConfigScript(env);
  if (html.includes("</head>")) {
    return html.replace("</head>", `${runtimeScript}</head>`);
  }
  if (html.includes("</body>")) {
    return html.replace("</body>", `${runtimeScript}</body>`);
  }
  return `${html}${runtimeScript}`;
}

async function maybeInjectRuntimeConfig(response, env, { headRequest = false } = {}) {
  const contentType = response.headers.get("content-type") || "";
  if (headRequest || !contentType.toLowerCase().includes("text/html")) {
    return response;
  }

  const html = await response.text();
  const injectedHtml = injectConfigIntoHtml(html, env);
  const headers = new Headers(response.headers);
  headers.set("content-length", String(new TextEncoder().encode(injectedHtml).byteLength));

  return new Response(injectedHtml, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function withSecurityHeaders(response, env, { headRequest = false } = {}) {
  const headers = new Headers(response.headers);
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("X-Frame-Options", "DENY");

  const connectSrc = [
    "'self'",
    "https://www.google-analytics.com",
    "https://region1.google-analytics.com",
  ];

  try {
    if (env.SUPABASE_URL) {
      connectSrc.push(new URL(env.SUPABASE_URL).origin);
    }
  } catch (_error) {
    // Ignore malformed SUPABASE_URL values so requests still serve static assets.
  }

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

  return new Response(headRequest ? null : response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleEntitlementsApi(request, env) {
  const accessToken = parseBearerToken(request.headers.get("authorization"));
  if (!accessToken) {
    return jsonResponse(401, {
      authenticated: false,
      error: "missing_or_invalid_bearer_token",
    });
  }

  if (!env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY) {
    return jsonResponse(500, {
      authenticated: false,
      error: "supabase_not_configured",
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
      error: "invalid_token",
    });
  }

  const userPayload = await userResponse.json();
  const userId = userPayload?.id;
  if (!userId) {
    return jsonResponse(401, {
      authenticated: false,
      error: "invalid_user_payload",
    });
  }

  const entitlementsUrl = new URL(`${env.SUPABASE_URL}/rest/v1/user_entitlements`);
  entitlementsUrl.searchParams.set("user_id", `eq.${userId}`);
  entitlementsUrl.searchParams.set("select", "user_id,premium_enabled,premium_until");
  entitlementsUrl.searchParams.set("limit", "1");

  const entitlementResponse = await fetch(entitlementsUrl.toString(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      apikey: env.SUPABASE_SERVICE_ROLE_KEY,
    },
  });

  if (!entitlementResponse.ok) {
    return jsonResponse(502, {
      authenticated: true,
      userId,
      error: "entitlements_lookup_failed",
    });
  }

  const rows = await entitlementResponse.json();
  const row = Array.isArray(rows) ? rows[0] : null;

  let premium = false;
  let reason = "no_row";
  let premiumUntil = null;

  if (row) {
    premiumUntil = row.premium_until ?? null;

    if (row.premium_enabled === true) {
      if (!premiumUntil) {
        premium = true;
        reason = "enabled";
      } else {
        const premiumUntilTime = Date.parse(premiumUntil);
        if (Number.isFinite(premiumUntilTime) && premiumUntilTime > Date.now()) {
          premium = true;
          reason = "enabled";
        } else {
          reason = "expired";
        }
      }
    } else {
      reason = "disabled";
    }
  }

  return jsonResponse(200, {
    authenticated: true,
    userId,
    premium,
    premiumUntil,
    reason,
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/me/entitlements") {
      if (request.method !== "GET") {
        return withSecurityHeaders(
          jsonResponse(405, { error: "method_not_allowed" }),
          env,
          { headRequest: request.method === "HEAD" },
        );
      }

      const response = await handleEntitlementsApi(request, env);
      return withSecurityHeaders(response, env, {
        headRequest: request.method === "HEAD",
      });
    }

    const rewrittenPath = ROOT_PATH_REWRITES[url.pathname];

    let assetResponse;
    if (rewrittenPath) {
      url.pathname = rewrittenPath;
      const assetRequest = new Request(url.toString(), {
        method: "GET",
        headers: request.headers,
      });
      assetResponse = await env.ASSETS.fetch(assetRequest);
    } else {
      assetResponse = await env.ASSETS.fetch(request);
    }

    const responseWithConfig = await maybeInjectRuntimeConfig(assetResponse, env, {
      headRequest: request.method === "HEAD",
    });

    return withSecurityHeaders(responseWithConfig, env, {
      headRequest: request.method === "HEAD",
    });
  },
};
