import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { ClientOnly } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { channelsQuery } from "@/lib/channels";
import EpgSection from "@/components/EpgSection";
import PlugoChat from "@/components/PlugoChat";
import { splitEpg, fmtTime, epgQuery } from "@/lib/epg";

const ShakaPlayer = lazy(() => import("@/components/ShakaPlayer"));

export const Route = createFileRoute("/watch/$id")({
  loader: async ({ context, params }) => {
    const list = await context.queryClient.ensureQueryData(channelsQuery);
    const ch = list.find((c) => c.id === params.id);
    if (!ch) throw notFound();
    return { name: ch.name };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.name ?? "Channel"} — PlugX TV` },
      { name: "description", content: `Watch ${loaderData?.name ?? "this channel"} live.` },
      { property: "og:title", content: `${loaderData?.name ?? "Channel"} — PlugX TV` },
      { property: "og:description", content: `Watch ${loaderData?.name ?? "this channel"} live.` },
      { property: "og:type", content: "video.other" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Watch,
});

function Watch() {
  const { id } = Route.useParams();
  const { data } = useSuspenseQuery(channelsQuery);
  const ch = data.find((c) => c.id === id)!;
  const related = data.filter((c) => c.group === ch.group && c.id !== ch.id).slice(0, 18);
  const { data: epg } = useQuery(epgQuery(id));
  const { current, upNext } = splitEpg(epg ?? []);
  const plugoContext = {
    channelName: ch.name,
    channelGroup: ch.group || "General",
    nowPlaying: current
      ? `${current.title} (${fmtTime(current.start)}–${fmtTime(current.stop)}, ${current.category})${current.synopsis ? ` — ${current.synopsis.slice(0, 200)}` : ""}`
      : undefined,
    upNext: upNext.slice(0, 6).map((p) => `${p.title} at ${fmtTime(p.start)}`),
  };

  return (
    <main className="mx-auto max-w-6xl px-4 py-6">
      <Link to="/" className="mb-4 inline-block text-sm text-muted-foreground hover:text-primary">
        ← All channels
      </Link>
      <ClientOnly fallback={<div className="aspect-video w-full rounded-xl bg-card" />}>
        <Suspense fallback={<div className="aspect-video w-full rounded-xl bg-card" />}>
          <ShakaPlayer channel={ch} />
        </Suspense>
      </ClientOnly>
      <div className="mt-5 flex items-center gap-4 rounded-2xl border border-border bg-card/60 p-4 backdrop-blur">
        <img src={ch.logo} alt="" className="h-14 w-14 rounded-xl bg-background object-contain p-1.5 shadow-md" />
        <div>
          <h1 className="font-display text-2xl font-bold tracking-tight">{ch.name}</h1>
          <p className="text-sm text-muted-foreground">{ch.group}</p>
        </div>
        <span className="ml-auto flex items-center gap-1.5 rounded-full bg-destructive/15 px-3.5 py-1.5 text-xs font-bold tracking-wider text-destructive">
          <span className="h-2 w-2 animate-pulse rounded-full bg-destructive" />
          LIVE
        </span>
      </div>
      <EpgSection channelId={id} />
      <PlugoChat context={plugoContext} />
      {related.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-4 font-display text-lg font-semibold">More in {ch.group}</h2>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {related.map((c) => (
              <Link key={c.id} to="/watch/$id" params={{ id: c.id }}
                className="group flex flex-col items-center gap-2 rounded-xl border border-border bg-card/60 p-3 backdrop-blur transition-all duration-300 hover:-translate-y-1 hover:border-primary/50 hover:shadow-[0_12px_30px_-12px_var(--primary)]">
                <img src={c.logo} alt={c.name} loading="lazy" className="h-12 object-contain transition-transform duration-300 group-hover:scale-110" />
                <span className="line-clamp-1 text-center text-[11px] font-medium">{c.name}</span>
              </Link>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
