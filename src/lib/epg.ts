import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { queryOptions } from "@tanstack/react-query";

const JIO_EPG_API = "https://jiotvapi.cdn.jio.com/apis/v1.3/getepg/get";
const JIO_IMG = "https://jiotvimages.cdn.jio.com/dare_images/shows/";

export interface EpgProgram {
  start: number; // epoch seconds
  stop: number;
  title: string;
  episodeTitle: string;
  synopsis: string;
  category: string;
  poster: string;
  episode: number | null;
  durationMin: number;
  cast: string[];
}

function img(path?: string): string {
  if (!path) return "";
  if (path.startsWith("http")) return path;
  return JIO_IMG + path.replace(/^\/+/, "");
}

function str(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function normalize(ep: any, channelId: string): EpgProgram | null {
  const start = Math.floor(Number(ep?.startEpoch) / 1000);
  const stop = Math.floor(Number(ep?.endEpoch) / 1000);
  if (!start || !stop || stop <= start) return null;
  const epCid = ep?.channelId ?? ep?.channel_id;
  if (epCid != null && String(epCid) !== channelId) return null;

  const desc = str(ep?.description);
  const synopsis = str(ep?.longDescription) || str(ep?.episode_desc) || str(ep?.episodeSynopsis) || desc;

  let category = "General";
  const genreRaw = ep?.showGenre;
  if (Array.isArray(genreRaw) && genreRaw.length) category = genreRaw.join(", ");
  else if (typeof genreRaw === "string" && genreRaw.trim()) {
    const g = genreRaw.replace(/[[\]'"]/g, "").trim();
    if (g) category = g;
  } else if (ep?.showCategory) category = String(ep.showCategory);

  let cast: string[] = [];
  const castRaw = ep?.starCast ?? ep?.cast;
  if (Array.isArray(castRaw)) {
    cast = castRaw
      .map((a: unknown) => (typeof a === "string" ? a : str((a as { name?: string })?.name)))
      .filter(Boolean);
  } else if (typeof castRaw === "string") {
    cast = castRaw
      .split(",")
      .map((s: string) => s.replace(/\s*\(.*?\)\s*/g, "").trim())
      .filter(Boolean);
  }

  const poster =
    img(str(ep?.episodePoster)) ||
    img(str(ep?.episodeBanner)) ||
    img(str(ep?.showBanner)) ||
    img(str(ep?.showPoster)) ||
    img(str(ep?.episodeThumbnail)) ||
    img(str(ep?.showThumbnail));

  return {
    start,
    stop,
    title: str(ep?.showname) || str(ep?.show_name) || "Live Program",
    episodeTitle: str(ep?.episodeTitle),
    synopsis,
    category,
    poster,
    episode: (() => {
      const n = Number(ep?.episode_num ?? ep?.episodeNo);
      return Number.isFinite(n) && n > 0 ? n : null;
    })(),
    durationMin: Math.max(1, Math.round((stop - start) / 60)),
    cast,
  };
}

const ALLOWED = [".lovable.app", "localhost", "127.0.0.1"];
function assertSameSite(request: Request) {
  const ref = request.headers.get("origin") ?? request.headers.get("referer") ?? "";
  if (!ref) return; // server-side SSR call
  let host = "";
  try {
    host = new URL(ref).hostname;
  } catch {
    throw new Error("Forbidden");
  }
  if (!ALLOWED.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h))) {
    throw new Error("Forbidden");
  }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseEpg(raw: any[], channelId: string): EpgProgram[] {
  const seen = new Set<string>();
  const programs: EpgProgram[] = [];
  for (const ep of raw) {
    const p = normalize(ep, channelId);
    if (!p) continue;
    const key = `${p.start}_${p.title}`;
    if (seen.has(key)) continue;
    seen.add(key);
    programs.push(p);
  }
  programs.sort((a, b) => a.start - b.start);
  return programs;
}

/** Browser-side fetch: the guide API allows CORS and viewers are in India. */
async function fetchEpgDirect(channelId: string): Promise<EpgProgram[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = [];
  const results = await Promise.allSettled(
    [0, 1].map((offset) =>
      fetch(`${JIO_EPG_API}?offset=${offset}&channel_id=${encodeURIComponent(channelId)}&langId=6`).then((r) =>
        r.ok ? (r.json() as Promise<{ epg?: unknown[] }>) : null,
      ),
    ),
  )
  for (const r of results) if (r.status === "fulfilled" && Array.isArray(r.value?.epg)) raw.push(...r.value.epg);
  return parseEpg(raw, channelId);
}

export const fetchEpg = createServerFn({ method: "GET" })
  .inputValidator((id: string) => String(id ?? ""))
  .handler(async ({ data: channelId }): Promise<EpgProgram[]> => {
    assertSameSite(getRequest());
    if (!channelId) return [];

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = [];
    for (const offset of [0, 1]) {
      try {
        const res = await fetch(
          `${JIO_EPG_API}?offset=${offset}&channel_id=${encodeURIComponent(channelId)}&langId=6`,
          {
            headers: {
              "User-Agent":
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36",
              "Accept-Language": "en-IN,en;q=0.9",
              Accept: "application/json, */*",
            },
          },
        );
        if (!res.ok) continue;
        const json = (await res.json()) as { epg?: unknown[] };
        if (Array.isArray(json?.epg)) raw.push(...json.epg);
      } catch {
        // try next offset
      }
    }

    return parseEpg(raw, channelId);
  });

export const epgQuery = (channelId: string) =>
  queryOptions({
    queryKey: ["epg", channelId],
    queryFn: async () => {
      if (typeof window !== "undefined") {
        try {
          const direct = await fetchEpgDirect(channelId);
          if (direct.length) return direct;
        } catch {
          // fall back to server
        }
      }
      return fetchEpg({ data: channelId });
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

/** Split a program list into now-playing + upcoming. */
export function splitEpg(programs: EpgProgram[], now = Math.floor(Date.now() / 1000)) {
  const current = programs.find((p) => p.start <= now && now < p.stop) ?? null;
  const upNext = programs.filter((p) => p.start >= now).slice(0, 12);
  return { current, upNext };
}

export function fmtTime(epochSec: number): string {
  return new Date(epochSec * 1000).toLocaleTimeString("en-IN", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  });
}
