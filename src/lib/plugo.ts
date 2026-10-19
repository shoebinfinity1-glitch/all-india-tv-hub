import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";

const FREE_AI = "https://api-rebix.vercel.app/api/cohere";
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";

export interface PlugoMessage {
  role: "user" | "assistant";
  content: string;
}

export interface PlugoContext {
  channelName: string;
  channelGroup: string;
  nowPlaying?: string | undefined;
  upNext?: string[] | undefined;
  language?: string | undefined;
}

const ALLOWED = [".lovable.app", "localhost", "127.0.0.1"];
function assertSameSite(request: Request) {
  const ref = request.headers.get("origin") ?? request.headers.get("referer") ?? "";
  if (!ref) return;
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

export const plugoChat = createServerFn({ method: "POST" })
  .inputValidator((input: { messages: PlugoMessage[]; context: PlugoContext }) => ({
    messages: Array.isArray(input?.messages) ? input.messages.slice(-12) : [],
    context: input?.context ?? { channelName: "", channelGroup: "" },
  }))
  .handler(async ({ data }): Promise<{ reply: string }> => {
    assertSameSite(getRequest());
    const apiKey = process.env["LOVABLE_API_KEY"];

    const { channelName, channelGroup, nowPlaying, upNext, language } = data.context;
    const system = [
      "You are Plugo, the friendly TV buddy inside PlugX TV, an Indian live-TV streaming app.",
      "You help viewers know what is live, what is coming next, and fun stuff about shows, movies, cricket and Bollywood.",
      "Keep answers short (2-4 sentences), warm and Hinglish-friendly. Use an emoji or two.",
      `The viewer is currently watching: ${channelName || "unknown channel"} (${channelGroup || "General"}).`,
      nowPlaying ? `Now playing on this channel: ${nowPlaying}.` : channelName.includes("home page") ? "" : "No EPG data for the current program.",
      upNext?.length
        ? channelName.includes("home page")
          ? `Some channels available in the app: ${upNext.join(" • ")}. Suggest the viewer open one from the list.`
          : `Coming up next: ${upNext.join(" • ")}.`
        : "",
      language
        ? `IMPORTANT: Always reply ONLY in ${String(language).slice(0, 60)}, whatever language the viewer writes in.`
        : "Reply in the same language the viewer uses.",
      "If asked what's live or next, answer from this guide data. Never invent exact show timings you don't have.",
    ]
      .filter(Boolean)
      .join("\n");

    // Primary: free Rebix (Cohere) API — saves Lovable AI credits. It takes a single
    // text query, so we pack the persona, guide data and recent chat into it.
    try {
      const history = data.messages
        .slice(-6)
        .map((m) => `${m.role === "user" ? "Viewer" : "Plugo"}: ${m.content.slice(0, 400)}`)
        .join("\n");
      const prompt = `${system}\n\nConversation so far:\n${history}\n\nReply as Plugo to the viewer's last message only. Do not write code.`;
      const r = await fetch(`${FREE_AI}?q=${encodeURIComponent(prompt.slice(0, 5000))}`, {
        headers: { Accept: "application/json" },
      });
      if (r.ok) {
        const j = (await r.json()) as { status?: boolean; message?: string };
        const msg = typeof j?.message === "string" ? j.message.trim() : "";
        if (j?.status !== false && msg) return { reply: msg.replace(/^Plugo:\s*/i, "") };
      }
      console.error(`Free AI failed [${r.status}], falling back to Lovable AI`);
    } catch (e) {
      console.error("Free AI fetch failed, falling back:", e);
    }

    if (!apiKey) return { reply: "Plugo abhi offline hai — thodi der baad try karo. 🔌" };
    try {
      const res = await fetch(GATEWAY, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "openai/gpt-6-astra",
          reasoning_effort: "low",
          messages: [
            { role: "system", content: system },
            ...data.messages.map((m) => ({ role: m.role, content: m.content.slice(0, 2000) })),
          ],
        }),
      });
      if (!res.ok) {
        const body = await res.text();
        console.error(`Plugo gateway error [${res.status}]: ${body}`);
        if (res.status === 402) return { reply: "AI credits khatam ho gaye hain — workspace mein credits add karo. 🙏" };
        if (res.status === 429) return { reply: "Thoda slow ho gaya… ek minute baad phir try karo! ⏳" };
        return { reply: "Oops, Plugo ka connection hil gaya. Thodi der baad try karo! 🔌" };
      }
      const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
      const reply = json.choices?.[0]?.message?.content?.trim();
      return { reply: reply || "Hmm, kuch samajh nahi aaya. Phir se poochho? 😅" };
    } catch (e) {
      console.error("Plugo fetch failed:", e);
      return { reply: "Network issue lag raha hai — thodi der baad try karo! 📡" };
    }
  });
