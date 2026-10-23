import { test } from "node:test";
import assert from "node:assert/strict";
import CryptoJS from "crypto-js";
import {
  normalizeSearchQuery,
  tokenizeQuery,
  extractSearchFields,
  decryptMediaUrl,
  uniqueSongsById,
  rankSearchResults,
} from "../src/services/saavn.service.js";

// Encrypts a URL the way JioSaavn does, so the test needs no network access.
const encryptMediaUrl = (url) =>
  CryptoJS.DES.encrypt(url, CryptoJS.enc.Utf8.parse("38346591"), { mode: CryptoJS.mode.ECB }).toString();

test("normalizeSearchQuery removes accents, punctuation and HTML entities", () => {
  assert.equal(normalizeSearchQuery("  Café   Déjà-Vu!! "), "cafe deja vu");
  assert.equal(normalizeSearchQuery("Salim &amp; Sulaiman"), "salim and sulaiman");
  assert.equal(normalizeSearchQuery(null), "");
  assert.equal(normalizeSearchQuery("दिल से"), "दिल से");
});

test("tokenizeQuery splits a query into clean lowercase tokens", () => {
  assert.deepEqual(tokenizeQuery("Tum Hi Ho - Arijit Singh"), ["tum", "hi", "ho", "arijit", "singh"]);
  assert.deepEqual(tokenizeQuery("   "), []);
});

test("extractSearchFields merges and de-duplicates artists from every source", () => {
  const fields = extractSearchFields({
    name: "Kesariya",
    album: { name: "Brahmastra" },
    artists: { primary: [{ name: "Arijit Singh" }], all: [{ name: "Arijit Singh" }, { name: "Pritam" }] },
    primary_artists: "Arijit Singh, Amitabh Bhattacharya",
  });

  assert.equal(fields.title, "Kesariya");
  assert.equal(fields.album, "Brahmastra");
  assert.deepEqual(fields.artists, ["Arijit Singh", "Pritam", "Amitabh Bhattacharya"]);
  assert.equal(fields.searchableText, "kesariya arijit singh pritam amitabh bhattacharya brahmastra");
});

test("decryptMediaUrl turns an encrypted media URL into a CDN link", () => {
  const url = "https://aac.saavncdn.com/815/abc123_96.mp4";
  assert.equal(decryptMediaUrl(encryptMediaUrl(url)), url);
  // Older payloads point at the web/preview hosts, which need rewriting.
  assert.equal(decryptMediaUrl(encryptMediaUrl("https://web.saavncdn.com/815/abc_96.mp4")), "https://aac.saavncdn.com/815/abc_96.mp4");
});

test("decryptMediaUrl rejects anything that is not an audio link", () => {
  assert.equal(decryptMediaUrl(""), "");
  assert.equal(decryptMediaUrl("not-base64-at-all"), "");
  assert.equal(decryptMediaUrl(encryptMediaUrl("javascript:alert(1)")), "");
});

test("uniqueSongsById keeps order and prefers the copy with a stream", () => {
  const songs = uniqueSongsById([
    { id: "a", name: "First (no stream)" },
    { id: "b", name: "Second", media: { encryptedUrl: "x" } },
    { id: "a", name: "First (web copy)", media: { encryptedUrl: "y" } },
    { id: "b", name: "Second duplicate", media: { encryptedUrl: "z" } },
    { name: "No id" },
  ]);

  assert.deepEqual(songs.map((song) => song.name), ["First (web copy)", "Second"]);
});

test("hybrid ranking puts exact song titles ahead of partial matches", () => {
  const ranked = rankSearchResults([
    { id: "partial", title: "Blinding", artist: "Various Artists" },
    { id: "exact", title: "Blinding Lights", artist: "The Weeknd" },
  ], "song", "Blinding Lights", "general", 10);

  assert.equal(ranked[0].id, "exact");
});

test("fuzzy ranking handles transposed title letters without promoting unrelated songs", () => {
  const ranked = rankSearchResults([
    { id: "unrelated", title: "Blinding (Live)", artist: "Someone Else" },
    { id: "target", title: "Blinding Lights", artist: "The Weeknd" },
  ], "song", "blinding ligths", "general", 10);

  assert.equal(ranked[0].id, "target");
});

test("artist and album exact matches rank in their own result groups", () => {
  const artist = rankSearchResults([
    { id: "artist", name: "Arijit Singh", isVerified: true },
    { id: "other", name: "Armaan Malik", isVerified: true },
  ], "artist", "Arijit Singh", "artist", 10);
  const album = rankSearchResults([
    { id: "album-other", name: "Brahmastra: Part One" },
    { id: "album", name: "Brahmastra" },
  ], "album", "Brahmastra", "album", 10);

  assert.equal(artist[0].id, "artist");
  assert.equal(album[0].id, "album");
});

test("fuzzy artist queries keep the matching verified artist above other profiles", () => {
  const ranked = rankSearchResults([
    { id: "other", name: "Armaan Malik", isVerified: true },
    { id: "artist", name: "Arijit Singh", isVerified: true },
  ], "artist", "arjit singh", "general", 10);

  assert.equal(ranked[0].id, "artist");
});
