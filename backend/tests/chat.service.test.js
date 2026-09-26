import { test } from "node:test";
import assert from "node:assert/strict";

const { EDIT_WINDOW_MS, canEditMessage, canSeePresence, statusForViewer, toggleReaction } = await import("../src/services/chat.service.js");

test("only the sender can edit, and only for a short while", () => {
  const now = Date.now();
  const message = { senderId: "me", createdAt: new Date(now - 60_000) };
  assert.equal(canEditMessage(message, "me", now), true);
  assert.equal(canEditMessage(message, "friend", now), false);
  assert.equal(canEditMessage({ ...message, createdAt: new Date(now - EDIT_WINDOW_MS - 1000) }, "me", now), false);
});

test("reactions: one per person, a different emoji replaces it, the same one removes it", () => {
  let reactions = toggleReaction([], "me", "❤️");
  assert.deepEqual(reactions, [{ userId: "me", emoji: "❤️" }]);
  reactions = toggleReaction([...reactions, { userId: "friend", emoji: "😂" }], "me", "🔥");
  assert.deepEqual(reactions, [{ userId: "friend", emoji: "😂" }, { userId: "me", emoji: "🔥" }]);
  reactions = toggleReaction(reactions, "me", "🔥");
  assert.deepEqual(reactions, [{ userId: "friend", emoji: "😂" }]);
});

test("someone with read receipts off doesn't see them on their own messages", () => {
  const sent = { senderId: "me", status: "read" };
  assert.equal(statusForViewer(sent, { clerkId: "me", readReceipts: true }), "read");
  assert.equal(statusForViewer(sent, { clerkId: "me", readReceipts: false }), "delivered");
  // Messages received from others keep their real status.
  assert.equal(statusForViewer({ senderId: "friend", status: "read" }, { clerkId: "me", readReceipts: false }), "read");
});

test("online status is visible only when both people share theirs", () => {
  const me = { clerkId: "me", showActivityStatus: true };
  const friend = { clerkId: "friend", showActivityStatus: true };
  assert.equal(canSeePresence(friend, me), true);
  assert.equal(canSeePresence({ ...friend, showActivityStatus: false }, me), false);
  assert.equal(canSeePresence(friend, { ...me, showActivityStatus: false }), false);
  assert.equal(canSeePresence({ ...me, showActivityStatus: false }, { ...me, showActivityStatus: false }), true);
  // Accounts from before the setting existed share their status.
  assert.equal(canSeePresence({ clerkId: "old" }, { clerkId: "older" }), true);
});
