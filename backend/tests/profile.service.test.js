import { test } from "node:test";
import assert from "node:assert/strict";

const {
  displayImageFor, escapeRegex, normalizeWebsite, photoSourceAvailable, photoStateOf, photoUpdate, summarizeListening, validateProfileUpdate,
} = await import("../src/services/profile.service.js");

test("profile updates are trimmed and only include the fields that were sent", () => {
  const { updates, error } = validateProfileUpdate({ fullName: "  Riya P  ", bio: " hi ", location: "Pune" });
  assert.equal(error, undefined);
  assert.deepEqual(updates, { fullName: "Riya P", bio: "hi", location: "Pune" });
});

test("profile updates reject bad names, usernames and oversized text", () => {
  assert.match(validateProfileUpdate({ fullName: "   " }).error, /display name/);
  assert.match(validateProfileUpdate({ username: "no spaces!" }).error, /Username/);
  assert.match(validateProfileUpdate({ bio: "x".repeat(281) }).error, /Bio/);
  assert.match(validateProfileUpdate({ location: "x".repeat(61) }).error, /Location/);
});

test("email is never changed from the profile form", () => {
  const { updates } = validateProfileUpdate({ email: "someone@else.com", fullName: "Riya" });
  assert.equal("email" in updates, false);
});

test("websites are normalised to full links and junk is rejected", () => {
  assert.equal(normalizeWebsite("mysite.com"), "https://mysite.com/");
  assert.equal(normalizeWebsite("http://blog.example.org/me"), "http://blog.example.org/me");
  assert.equal(normalizeWebsite(""), "");
  assert.equal(normalizeWebsite("not a link"), null);
  assert.equal(normalizeWebsite("javascript:alert(1)"), null);
  assert.match(validateProfileUpdate({ website: "nope" }).error, /website/);
});

test("usernames are escaped before being used in a lookup pattern", () => {
  assert.equal(new RegExp(`^${escapeRegex("a.b")}$`).test("axb"), false);
});

test("music taste counts plays per main artist and lists each recent song once", () => {
  const at = (minutesAgo) => new Date(Date.now() - minutesAgo * 60_000);
  const { topArtists, recent } = summarizeListening([
    { songId: "1", title: "Kesariya", artist: "Arijit Singh", imageUrl: "k.jpg", playedAt: at(1) },
    { songId: "2", title: "Tum Hi Ho", artist: "Arijit Singh, Mithoon", imageUrl: "t.jpg", playedAt: at(5) },
    { songId: "1", title: "Kesariya", artist: "Arijit Singh", imageUrl: "k.jpg", playedAt: at(9) },
    { songId: "3", title: "Blinding Lights", artist: "The Weeknd", imageUrl: "b.jpg", playedAt: at(20) },
    { songId: "4", title: "Mystery", artist: "Unknown Artist", imageUrl: "", playedAt: at(30) },
  ]);

  assert.deepEqual(topArtists, [
    { name: "Arijit Singh", plays: 3, imageUrl: "k.jpg" },
    { name: "The Weeknd", plays: 1, imageUrl: "b.jpg" },
  ]);
  assert.deepEqual(recent.map((song) => song._id), ["1", "2", "3", "4"]);
});

test("older accounts keep the photo they had: an uploaded one or their Google one", () => {
  const uploaded = photoStateOf({ imageUrl: "https://res.cloudinary.com/demo/image/upload/v1/me.jpg" });
  assert.equal(uploaded.photoSource, "upload");
  assert.equal(displayImageFor(uploaded), "https://res.cloudinary.com/demo/image/upload/v1/me.jpg");

  const google = photoStateOf({ imageUrl: "https://img.clerk.com/abc" });
  assert.equal(google.photoSource, "provider");
  assert.equal(displayImageFor(google), "https://img.clerk.com/abc");
});

test("the chosen source decides the picture everyone sees, and the others are kept", () => {
  const state = { photoSource: "avatar", photoUrl: "https://up/me.jpg", providerImageUrl: "https://google/me.jpg", avatarImageUrl: "https://av/me.png" };
  assert.equal(displayImageFor(state), "https://av/me.png");
  assert.equal(photoUpdate({ ...state, photoSource: "upload" }).imageUrl, "https://up/me.jpg");
  assert.equal(photoUpdate({ ...state, photoSource: "provider" }).imageUrl, "https://google/me.jpg");
  assert.equal(photoUpdate({ ...state, photoSource: "none" }).imageUrl, "");
  assert.equal(photoUpdate({ ...state, photoSource: "none" }).avatarImageUrl, "https://av/me.png");
});

test("a new Google photo at sign-in doesn't replace an uploaded photo or avatar", () => {
  const state = photoStateOf({ photoSource: "upload", photoUrl: "https://up/me.jpg", providerImageUrl: "https://google/old.jpg" });
  const afterSignIn = photoUpdate({ ...state, providerImageUrl: "https://google/new.jpg" });
  assert.equal(afterSignIn.imageUrl, "https://up/me.jpg");
  assert.equal(afterSignIn.providerImageUrl, "https://google/new.jpg");
});

test("a source can only be chosen once its picture exists", () => {
  const state = { photoSource: "provider", photoUrl: "", providerImageUrl: "https://google/me.jpg", avatarImageUrl: "" };
  assert.equal(photoSourceAvailable(state, "provider"), true);
  assert.equal(photoSourceAvailable(state, "none"), true);
  assert.equal(photoSourceAvailable(state, "upload"), false);
  assert.equal(photoSourceAvailable(state, "avatar"), false);
});
