import { createFileRoute } from "@tanstack/react-router";

// ─────────────────────────────────────────────────────────────
// Android TV headers that JioTV CDN expects
// Without these, desktop browsers get 403 on manifest + segments
// ─────────────────────────────────────────────────────────────
const ANDROID_UA =
  "Mozilla/5.0 (Linux; Android 12; SM-X200) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36";

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, OPTIONS",
  "Access-Control-Allow-Headers": "Range, Origin, Accept-Encoding",
  "Access-Control-Expose-Headers":
    "Content-Length, Content-Range, Content-Type",
};

// Only proxy requests to known CDN hosts — don't become an open proxy
const ALLOWED_HOSTS = [
  "jiotvmblive.cdn.jio.com",
  "jiotvpllive.cdn.jio.com",
  "jiotv.catchup.cdn.jio.com",
  "jiotvimages.cdn.jio.com",
  "cdn.jio.com",
  "akamaized.net",
  "cloudfront.net",
  "media.jiocinema.com",
];

function isAllowedUrl(url: string): boolean {
  try {
    const host = new URL(url).hostname;
    return ALLOWED_HOSTS.some(
      (h) => host === h || host.endsWith("." + h),
    );
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────
// GET /api/proxy?url=<encoded CDN URL>
//
// Proxies manifest (.mpd/.m3u8) and segment requests to JioTV
// CDN with Android TV User-Agent + Referer so they don't get
// 403'd on desktop browsers.
//
// Why this is needed:
//   - JioTV CDN checks User-Agent — desktop Chrome gets blocked
//   - Browsers forbid overriding User-Agent in JS fetch
//   - CORS prevents direct CDN access from browser
//   - Android TV / Kodi / TiviMate work because they send
//     mobile/TV user agents natively
// ─────────────────────────────────────────────────────────────
export const Route = createFileRoute("/api/proxy")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // CORS preflight
        if (request.method === "OPTIONS") {
          return new Response(null, { status: 204, headers: CORS_HEADERS });
        }

        const reqUrl = new URL(request.url);
        const targetUrl = reqUrl.searchParams.get("url");

        if (!targetUrl) {
          return new Response("Missing ?url= parameter", {
            status: 400,
            headers: CORS_HEADERS,
          });
        }

        if (!isAllowedUrl(targetUrl)) {
          return new Response("URL not allowed", {
            status: 403,
            headers: CORS_HEADERS,
          });
        }

        try {
          const targetOrigin = new URL(targetUrl).origin;

          // Build upstream headers — mimic Android TV
          const upstreamHeaders: Record<string, string> = {
            "User-Agent": ANDROID_UA,
            Referer: targetOrigin + "/",
            Origin: targetOrigin,
            Accept: "*/*",
            "Accept-Language": "en-IN,en;q=0.9,hi;q=0.8",
          };

          // Forward Range header for segment requests
          const range = request.headers.get("Range");
          if (range) {
            upstreamHeaders["Range"] = range;
          }

          // Forward Accept-Encoding
          const ae = request.headers.get("Accept-Encoding");
          if (ae) {
            upstreamHeaders["Accept-Encoding"] = ae;
          }

          const upstream = await fetch(targetUrl, {
            headers: upstreamHeaders,
            redirect: "follow",
          });

          if (!upstream.ok) {
            return new Response(
              `Upstream returned ${upstream.status}`,
              {
                status: upstream.status,
                headers: CORS_HEADERS,
              },
            );
          }

          // Pass through the response with CORS headers
          const responseHeaders: Record<string, string> = {
            ...CORS_HEADERS,
          };

          // Forward content headers
          const ct = upstream.headers.get("Content-Type");
          if (ct) responseHeaders["Content-Type"] = ct;

          const cl = upstream.headers.get("Content-Length");
          if (cl) responseHeaders["Content-Length"] = cl;

          const cr = upstream.headers.get("Content-Range");
          if (cr) responseHeaders["Content-Range"] = cr;

          // Cache segments aggressively, manifests briefly
          if (
            targetUrl.includes(".mpd") ||
            targetUrl.includes(".m3u8") ||
            targetUrl.includes("index.")
          ) {
            responseHeaders["Cache-Control"] = "no-cache";
          } else {
            responseHeaders["Cache-Control"] =
              "public, max-age=300, immutable";
          }

          const body = await upstream.arrayBuffer();
          return new Response(body, {
            status: upstream.status,
            headers: responseHeaders,
          });
        } catch (e: unknown) {
          const msg = e instanceof Error ? e.message : String(e);
          return new Response(`Proxy error: ${msg}`, {
            status: 502,
            headers: CORS_HEADERS,
          });
        }
      },
    },
  },
});
