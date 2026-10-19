import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { epgQuery, splitEpg, fmtTime, type EpgProgram } from "@/lib/epg";

function useNow() {
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));
  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

function Poster({ src, title, className }: { src: string; title: string; className: string }) {
  const [err, setErr] = useState(false);
  if (!src || err) {
    return (
      <div className={`flex items-center justify-center bg-gradient-to-br from-primary/25 to-chart-5/20 ${className}`}>
        <span className="font-display text-2xl font-bold text-primary/70">{title.slice(0, 1)}</span>
      </div>
    );
  }
  return <img src={src} alt={title} loading="lazy" onError={() => setErr(true)} className={`object-cover ${className}`} />;
}

function NowPlaying({ p, now }: { p: EpgProgram; now: number }) {
  const pct = Math.min(100, Math.max(0, ((now - p.start) / (p.stop - p.start)) * 100));
  return (
    <div className="overflow-hidden rounded-3xl border border-border bg-card/60 backdrop-blur">
      <div className="flex flex-col gap-5 p-5 sm:flex-row sm:p-6">
        <Poster src={p.poster} title={p.title} className="h-44 w-full shrink-0 rounded-2xl sm:h-48 sm:w-36" />
        <div className="min-w-0 flex-1">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-destructive/15 px-3 py-1 text-[10px] font-bold tracking-widest text-destructive">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-destructive" />
            NOW PLAYING
          </span>
          <h2 className="mt-2 font-display text-xl font-bold tracking-tight sm:text-2xl">{p.title}</h2>
          {p.episodeTitle && <p className="mt-0.5 text-sm text-muted-foreground">{p.episodeTitle}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span className="font-semibold text-foreground">
              {fmtTime(p.start)} – {fmtTime(p.stop)}
            </span>
            <span>• {p.durationMin} min</span>
            <span className="rounded-full border border-primary/30 bg-primary/10 px-2.5 py-0.5 font-medium text-primary">
              {p.category}
            </span>
            {p.episode && (
              <span className="rounded-full border border-border bg-secondary/60 px-2.5 py-0.5 font-medium">
                Ep {p.episode}
              </span>
            )}
          </div>
          {/* Progress */}
          <div className="mt-3">
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-chart-5 transition-[width] duration-1000"
                style={{ width: `${pct}%` }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">{Math.round(pct)}% watched</p>
          </div>
          {p.synopsis && <p className="mt-3 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{p.synopsis}</p>}
          {p.cast.length > 0 && (
            <p className="mt-2 text-xs text-muted-foreground">
              <span className="font-semibold text-foreground">Cast:</span> {p.cast.slice(0, 5).join(", ")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function UpNextCard({ p }: { p: EpgProgram }) {
  return (
    <div className="group w-36 shrink-0 overflow-hidden rounded-2xl border border-border bg-card/60 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_12px_30px_-12px_var(--primary)]">
      <div className="relative">
        <Poster src={p.poster} title={p.title} className="h-20 w-full" />
        <span className="absolute left-2 top-2 rounded-full bg-background/80 px-2 py-0.5 text-[10px] font-bold backdrop-blur">
          {fmtTime(p.start)}
        </span>
      </div>
      <div className="p-2.5">
        <p className="line-clamp-2 text-xs font-semibold leading-snug">{p.title}</p>
        <p className="mt-1 line-clamp-1 text-[10px] text-muted-foreground">
          {p.category} • {p.durationMin} min
        </p>
      </div>
    </div>
  );
}

export default function EpgSection({ channelId }: { channelId: string }) {
  const now = useNow();
  const { data, isLoading, isError } = useQuery(epgQuery(channelId));

  if (isLoading) {
    return (
      <section className="mt-8 animate-pulse">
        <div className="h-56 rounded-3xl border border-border bg-card/40" />
        <div className="mt-6 flex gap-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="h-32 w-36 shrink-0 rounded-2xl border border-border bg-card/40" />
          ))}
        </div>
      </section>
    );
  }
  if (isError || !data || data.length === 0) return null;

  const { current, upNext } = splitEpg(data, now);

  return (
    <section className="mt-8">
      {current && <NowPlaying p={current} now={now} />}
      {upNext.length > 0 && (
        <div className="mt-6">
          <h2 className="mb-3 font-display text-lg font-semibold">Up next</h2>
          <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {upNext.map((p) => (
              <UpNextCard key={`${p.start}_${p.title}`} p={p} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
