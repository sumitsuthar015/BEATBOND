import { test, mock } from "node:test";
import assert from "node:assert/strict";

// Replace the JioSaavn client so these tests run offline and deterministically.
const catalogue = [
  { id: "1", name: "Good Day Sunshine", artists: { primary: [{ name: "Artist A" }] }, downloadUrl: [{ quality: "160kbps", url: "https://cdn/1-160" }, { quality: "320kbps", url: "https://cdn/1-320" }] },
  { id: "2", name: "Sad Heartbreak Song", artists: { primary: [{ name: "Artist B" }] }, downloadUrl: [{ quality: "320kbps", url: "https://cdn/2" }] },
  { id: "3", name: "Party Remix", artists: { primary: [{ name: "Artist C" }] }, downloadUrl: [{ quality: "320kbps", url: "https://cdn/3" }] },
  { id: "4", name: "Dance Anthem", artists: { primary: [{ name: "Artist D" }] }, downloadUrl: [] },
  { id: "5", name: "Dil Ka Pyaar", artists: { primary: [{ name: "Artist E" }] }, downloadUrl: [{ quality: "160kbps", url: "https://cdn/5" }] },
];
const searchSongs = mock.fn(async () => ({ data: { results: catalogue } }));

mock.module(new URL("../src/services/saavn.service.js", import.meta.url).href, {
  namedExports: { searchSongs },
});

const { getMoodBasedSongs } = await import("../src/services/mood.service.js");

test("getMoodBasedSongs rejects an unknown mood", async () => {
  await assert.rejects(() => getMoodBasedSongs("angry"), /Invalid mood/);
});

test("happy playlist excludes sad and remixed songs", async () => {
  const songs = await getMoodBasedSongs("happy");
  const titles = songs.map((song) => song.title);

  assert.ok(titles.includes("Good Day Sunshine"));
  assert.ok(!titles.includes("Sad Heartbreak Song"));
  assert.ok(!titles.includes("Party Remix"));
  // Keyword matches ("sunshine", "good day") rank above neutral songs.
  assert.equal(titles[0], "Good Day Sunshine");
});

test("mood songs prefer 320kbps audio and drop unplayable tracks", async () => {
  const songs = await getMoodBasedSongs("party");

  assert.ok(!songs.some((song) => song._id === "4"), "song without audio must be removed");
  assert.equal(songs.find((song) => song._id === "1")?.audioUrl, "https://cdn/1-320");
  assert.equal(songs.find((song) => song._id === "5")?.audioUrl, "https://cdn/5");
});

test("mood results are cached so the catalogue is not searched again", async () => {
  await getMoodBasedSongs("romantic");
  const callsAfterFirst = searchSongs.mock.callCount();
  await getMoodBasedSongs("ROMANTIC");

  assert.equal(searchSongs.mock.callCount(), callsAfterFirst);
});
