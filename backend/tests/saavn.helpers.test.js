import { test } from "node:test";
import assert from "node:assert/strict";
import CryptoJS from "crypto-js";
import {
  normalizeSearchQuery,
  tokenizeQuery,
  extractSearchFields,
  decryptMediaUrl,
  uniqueSongsById,
} from "../src/services/saavn.service.js";

// Encrypts a URL the way JioSaavn does, so the test needs no network access.
const encryptMediaUrl = (url) =>
  CryptoJS.DES.encrypt(url, CryptoJS.enc.Utf8.parse("38346591"), { mode: CryptoJS.mode.ECB }).toString();

test("normalizeSearchQuery removes accents, punctuation and HTML entities", () => {
  assert.equal(normalizeSearchQuery("  Café   Déjà-Vu!! "), "cafe deja vu");
  assert.equal(normalizeSearchQuery("Salim &amp; Sulaiman"), "salim and sulaiman");
  assert.equal(normalizeSearchQuery(null), "");
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
