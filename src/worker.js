export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/favicon.ico") {
      const iconRequest = new Request(new URL("/icons/favicon.ico", url.origin), request);
      const iconResponse = await env.ASSETS.fetch(iconRequest);
      return new Response(iconResponse.body, {
        status: iconResponse.status,
        statusText: iconResponse.statusText,
        headers: {
          ...Object.fromEntries(iconResponse.headers.entries()),
          "content-type": "image/x-icon",
          "cache-control": "public, max-age=300",
        },
      });
    }

    return env.ASSETS.fetch(request);
  },
};
