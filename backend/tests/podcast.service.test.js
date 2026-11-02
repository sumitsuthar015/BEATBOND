import test from "node:test";
import assert from "node:assert/strict";
import { assertPublicFeedUrl, discoverPodcasts, parsePodcastDuration, parsePodcastFeed, searchPodcasts } from "../src/services/podcast.service.js";
import { normalizePodcastProgress } from "../src/controller/podcast.controller.js";

test("podcast duration and progress normalization handle valid and completed positions", () => {
  assert.equal(parsePodcastDuration("01:02:03"), 3723);
  assert.equal(parsePodcastDuration("bad"), 0);
  assert.deepEqual(normalizePodcastProgress(100, null, { positionSeconds: 96 }), { positionSeconds: 96, completed: true });
  assert.deepEqual(normalizePodcastProgress(100, { positionSeconds: 55 }, { mark: "unplayed" }), { positionSeconds: 0, completed: false });
});

test("podcast feed URLs reject local and private network hosts", async () => {
  await assert.rejects(assertPublicFeedUrl("http://127.0.0.1/feed.xml"), /not public/i);
  await assert.rejects(assertPublicFeedUrl("https://localhost/feed.xml"), /not public/i);
});

test("podcast parser maps HTTPS audio episodes and normalizes RSS text", () => {
  const episodes = parsePodcastFeed(`
    <rss><channel><item>
      <guid>episode-1</guid><title><![CDATA[Episode &amp; One]]></title>
      <description><![CDATA[<p>Talk &amp; music</p>]]></description>
      <pubDate>Mon, 02 Nov 2026 10:00:00 GMT</pubDate>
      <itunes:duration>01:02:03</itunes:duration>
      <enclosure url="https://cdn.example.com/audio.mp3?x=1&amp;y=2" type="audio/mpeg" />
    </item><item><title>Unsafe audio</title><enclosure url="http://127.0.0.1/secret" type="audio/mpeg" /></item>
    <item><title>Image episode</title><enclosure url="https://cdn.example.com/image.jpg" type="image/jpeg" /></item></channel></rss>`,
    { collectionId: "123", imageUrl: "https://cdn.example.com/cover.jpg" },
  );

  assert.equal(episodes.length, 1);
  assert.equal(episodes[0].id, "episode-1");
  assert.equal(episodes[0].title, "Episode & One");
  assert.equal(episodes[0].description, "Talk & music");
  assert.equal(episodes[0].duration, 3723);
  assert.equal(episodes[0].audioUrl, "https://cdn.example.com/audio.mp3?x=1&y=2");
});

test("podcast search returns RSS-backed shows from the Apple podcast catalog", async (t) => {
  let requestedUrl;
  t.mock.method(globalThis, "fetch", async (url) => {
    requestedUrl = new URL(url);
    return { ok: true, json: async () => ({ results: [{ collectionId: 1357911, collectionName: "A podcast show", artistName: "BeatBond Test", artworkUrl600: "https://cdn.example.com/podcast.jpg", trackCount: 42 }] }) };
  });

  const results = await searchPodcasts("music makers test");
  assert.equal(requestedUrl.hostname, "itunes.apple.com");
  assert.equal(requestedUrl.pathname, "/search");
  assert.equal(results[0].platform, "rss");
  assert.equal(results[0].collectionId, "1357911");
  assert.equal(results[0].title, "A podcast show");
});

test("podcast discovery returns new catalog picks and trending RSS shows", async (t) => {
  t.mock.method(globalThis, "fetch", async (url) => {
    const requestUrl = new URL(url);
    if (requestUrl.hostname === "itunes.apple.com") return {
      ok: true,
      json: async () => ({ results: [{ collectionId: 2468024, collectionName: "New catalog podcast", artistName: "New Host", artworkUrl100: "https://cdn.example.com/new.jpg" }] }),
    };
    return {
      ok: true,
      json: async () => ({ feed: { results: [{ id: "987654321", name: "Trending RSS show", artistName: "Popular Host", artworkUrl100: "https://cdn.example.com/trending.jpg" }] } }),
    };
  });
  const feed = await discoverPodcasts();
  assert.equal(feed.newPodcasts[0].collectionId, "2468024");
  assert.equal(feed.trendingPodcasts[0].collectionId, "987654321");
  assert.equal(feed.trendingPodcasts[0].platform, "rss");
});
