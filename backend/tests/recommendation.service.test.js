import { test } from "node:test";
import assert from "node:assert/strict";

const { buildListenerProfile, rankCoListened } = await import("../src/services/recommendation.service.js");

const at = (minutes) => new Date(Date.UTC(2026, 8, 24, 18, 0) + minutes * 60_000);

test("rankCoListened counts songs other listeners played in the same session", () => {
  const source = { id: "kes", name: "Kesariya", artist: "Arijit Singh" };
  const sourcePlays = [
    { userId: "u1", songId: "kes", title: "Kesariya", artist: "Arijit Singh", playedAt: at(0) },
    { userId: "u2", songId: "kes", title: "Kesariya", artist: "Arijit Singh", playedAt: at(0) },
  ];
  const sessionPlays = [
    ...sourcePlays,
    { userId: "u1", songId: "chm", title: "Channa Mereya", artist: "Arijit Singh", playedAt: at(5), completed: true },
    { userId: "u2", songId: "chm", title: "Channa Mereya", artist: "Arijit Singh", playedAt: at(-20), completed: true },
    { userId: "u2", songId: "hee", title: "Heeriye", artist: "Arijit Singh", playedAt: at(10), skipped: true },
    // Same listener, but a different day: not part of the session.
    { userId: "u1", songId: "old", title: "Old Song", artist: "Someone", playedAt: at(60 * 24) },
  ];

  const ranked = rankCoListened(sourcePlays, sessionPlays, source);

  assert.deepEqual(ranked.map((item) => [item.songId, item.listeners]), [["chm", 2], ["hee", 1]]);
  assert.equal(ranked[0].weight, 2);
  assert.equal(ranked[1].weight, 0.3);
});

test("rankCoListened counts each listener once per song", () => {
  const source = { id: "kes", name: "Kesariya", artist: "Arijit Singh" };
  const sourcePlays = [{ userId: "u1", songId: "kes", playedAt: at(0) }, { userId: "u1", songId: "kes", playedAt: at(30) }];
  const sessionPlays = [{ userId: "u1", songId: "chm", title: "Channa Mereya", artist: "Arijit Singh", playedAt: at(10), completed: true }];

  assert.equal(rankCoListened(sourcePlays, sessionPlays, source)[0].listeners, 1);
});

test("buildListenerProfile learns from skips and full listens", () => {
  const history = [
    { songId: "a1", artist: "Artist A", genre: "hindi", completed: true },
    { songId: "b1", artist: "Artist B", genre: "english", skipped: true, completionPercentage: 10 },
    { songId: "b2", artist: "Artist B", genre: "english", skipped: true, completionPercentage: 5 },
    { songId: "b3", artist: "Artist B", genre: "english", skipped: true, completionPercentage: 20 },
    { songId: "a2", artist: "Artist A", genre: "hindi", completed: true },
  ];

  const profile = buildListenerProfile(history);

  assert.deepEqual([...profile.skippedIds].sort(), ["b1", "b2", "b3"]);
  assert.equal(profile.skippedArtists.get("artist b"), 1);
  assert.equal(profile.skippedArtists.has("artist a"), false);
  assert.ok(profile.artistAffinity.get("artist a") > 0);
  assert.ok(profile.artistAffinity.get("artist b") < 0);
  assert.ok((profile.languageAffinity.get("hindi") || 0) > (profile.languageAffinity.get("english") || 0));
});
