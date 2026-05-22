/** Dev/preview proxy so the browser can fetch ICS feeds (avoids CORS). */
export function icsProxyPlugin() {
  const handler = async (req, res) => {
    try {
      const reqUrl = new URL(req.url, "http://localhost");
      const target = reqUrl.searchParams.get("url");
      if (!target) {
        res.statusCode = 400;
        res.end("Missing url parameter");
        return;
      }

      let parsed;
      try {
        parsed = new URL(target);
      } catch {
        res.statusCode = 400;
        res.end("Invalid url");
        return;
      }

      if (!["http:", "https:"].includes(parsed.protocol)) {
        res.statusCode = 400;
        res.end("Only http(s) URLs are allowed");
        return;
      }

      const response = await fetch(target, {
        headers: { "User-Agent": "calendar-dashboard/1.0" },
      });
      const text = await response.text();
      res.statusCode = response.status;
      res.setHeader("Content-Type", "text/plain; charset=utf-8");
      res.end(text);
    } catch (err) {
      res.statusCode = 500;
      res.end(err.message || "Proxy error");
    }
  };

  return {
    name: "ics-proxy",
    configureServer(server) {
      server.middlewares.use("/api/ics", handler);
    },
    configurePreviewServer(server) {
      server.middlewares.use("/api/ics", handler);
    },
  };
}
