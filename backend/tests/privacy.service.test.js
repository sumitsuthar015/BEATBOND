import { test } from "node:test";
import assert from "node:assert/strict";

const { canSeeListeningHistory, canSeeLiveActivity, liveActivityViewers } = await import("../src/services/privacy.service.js");

const owner = (overrides = {}) => ({
  clerkId: "me",
  friends: ["friend", "hidden-friend"],
  blockedUsers: ["blocked"],
  musicHiddenFrom: ["hidden-friend"],
  musicPrivacy: "friends",
  historyPrivacy: "friends",
  ...overrides,
});

test("the owner always sees their own listening", () => {
  assert.equal(canSeeLiveActivity(owner({ musicPrivacy: "none" }), "me"), true);
  assert.equal(canSeeListeningHistory(owner({ historyPrivacy: "none" }), "me"), true);
});

test("friends-only listening reaches friends but not strangers", () => {
  assert.equal(canSeeLiveActivity(owner(), "friend"), true);
  assert.equal(canSeeLiveActivity(owner(), "stranger"), false);
  assert.equal(canSeeListeningHistory(owner(), "friend"), true);
  assert.equal(canSeeListeningHistory(owner(), "stranger"), false);
});

test("a friend the owner hid their listening from sees nothing, even with Everyone", () => {
  assert.equal(canSeeLiveActivity(owner(), "hidden-friend"), false);
  assert.equal(canSeeListeningHistory(owner(), "hidden-friend"), false);
  assert.equal(canSeeLiveActivity(owner({ musicPrivacy: "everyone" }), "hidden-friend"), false);
  assert.equal(canSeeListeningHistory(owner({ historyPrivacy: "everyone" }), "hidden-friend"), false);
});

test("blocked people see nothing, even with Everyone", () => {
  assert.equal(canSeeLiveActivity(owner({ musicPrivacy: "everyone" }), "blocked"), false);
  assert.equal(canSeeListeningHistory(owner({ historyPrivacy: "everyone" }), "blocked"), false);
});

test("Only me hides listening from friends too", () => {
  assert.equal(canSeeLiveActivity(owner({ musicPrivacy: "none" }), "friend"), false);
  assert.equal(canSeeListeningHistory(owner({ historyPrivacy: "none" }), "friend"), false);
});

test("history stays private for accounts that never chose a setting", () => {
  const legacy = { clerkId: "me", friends: ["friend"], musicPrivacy: "everyone" };
  assert.equal(canSeeListeningHistory(legacy, "friend"), false);
  assert.equal(canSeeLiveActivity(legacy, "friend"), true);
});

test("live updates are sent only to connected people who may see them", () => {
  const connected = ["me", "friend", "hidden-friend", "stranger", "blocked"];
  assert.deepEqual(liveActivityViewers(owner(), connected), ["friend"]);
  assert.deepEqual(liveActivityViewers(owner({ musicPrivacy: "everyone" }), connected), ["friend", "stranger"]);
  assert.deepEqual(liveActivityViewers(owner({ musicPrivacy: "none" }), connected), []);
});
