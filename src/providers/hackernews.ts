const API = "https://hacker-news.firebaseio.com/v0";

export async function fetchHackerNews({ kind = "best", limit = 25 } = {}): Promise<Candidate[]> {
  if (!["best", "top", "new"].includes(kind)) throw providerError(400, "Tuntematon Hacker News -syöte.");
  const idsResponse = await fetch(`${API}/${kind}stories.json`, { signal: AbortSignal.timeout(8_000) });
  if (!idsResponse.ok) throw providerError(idsResponse.status, "Hacker News -listan haku epäonnistui.");
  const ids = (await idsResponse.json()).slice(0, Math.min(limit, 40));
  const stories = await Promise.all(ids.map(async id => {
    const response = await fetch(`${API}/item/${id}.json`, { signal: AbortSignal.timeout(8_000) });
    return response.ok ? response.json() : null;
  }));
  return stories.filter(story => story?.title && !story.deleted && !story.dead).map(normalizeStory);
}

function normalizeStory(story) {
  return {
    id: `hackernews:${story.id}`,
    sourceType: "hackernews",
    sourceName: "Hacker News",
    feedLayer: "discovery" as const,
    canonicalUrl: story.url || `https://news.ycombinator.com/item?id=${story.id}`,
    author: { id: story.by, name: story.by, handle: "news.ycombinator.com", avatar: null },
    text: story.title,
    language: null,
    publishedAt: new Date(story.time * 1000).toISOString(),
    indexedAt: new Date().toISOString(),
    engagement: { likes: story.score || 0, replies: story.descendants || 0, reposts: 0 },
    socialContext: "Hacker News · Best",
    reply: null,
    labels: [],
    media: []
  };
}

function providerError(status: number, message: string): Error & { status: number } { return Object.assign(new Error(message), { status }); }
import type { Candidate } from "../types.js";
