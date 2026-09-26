import { describe, expect, it } from "vitest";
import { EDIT_WINDOW_MS, buildChatItems, canEditMessage, dayLabel, summarizeReactions, toggleReaction } from "./chat";

const now = new Date(2026, 8, 26, 18, 0);
const at = (daysAgo: number, hour: number, minute = 0) => new Date(2026, 8, 26 - daysAgo, hour, minute).toISOString();

describe("dayLabel", () => {
  it("names recent days and dates older ones", () => {
    expect(dayLabel(at(0, 9), now)).toBe("Today");
    expect(dayLabel(at(1, 23), now)).toBe("Yesterday");
    expect(dayLabel(at(3, 12), now)).toBe(new Date(at(3, 12)).toLocaleDateString(undefined, { weekday: "long" }));
    expect(dayLabel(at(20, 12), now)).toBe(new Date(at(20, 12)).toLocaleDateString(undefined, { day: "numeric", month: "short" }));
  });
});

describe("buildChatItems", () => {
  it("adds a separator per day and groups quick messages from the same person", () => {
    const messages = [
      { _id: "a", senderId: "me", createdAt: at(1, 22, 0) },
      { _id: "b", senderId: "me", createdAt: at(0, 9, 0) },
      { _id: "c", senderId: "me", createdAt: at(0, 9, 2) },
      { _id: "d", senderId: "friend", createdAt: at(0, 9, 3) },
      { _id: "e", senderId: "friend", createdAt: at(0, 9, 30) },
    ];
    const items = buildChatItems(messages, now);
    expect(items.map((item) => (item.type === "day" ? item.label : item.key))).toEqual(["Yesterday", "a", "Today", "b", "c", "d", "e"]);
    const flags = Object.fromEntries(items.flatMap((item) => (item.type === "message" ? [[item.key, [item.startsGroup, item.endsGroup]]] : [])));
    expect(flags).toEqual({
      a: [true, true],
      b: [true, false],
      c: [false, true],
      d: [true, true],
      e: [true, true], // 27 minutes later starts a new group
    });
  });
});

describe("reactions", () => {
  it("counts each emoji and marks your own", () => {
    const summary = summarizeReactions([{ userId: "me", emoji: "❤️" }, { userId: "friend", emoji: "❤️" }, { userId: "x", emoji: "😂" }], "me");
    expect(summary).toEqual([{ emoji: "❤️", count: 2, mine: true }, { emoji: "😂", count: 1, mine: false }]);
  });

  it("toggles like the server: replace, or remove when tapped again", () => {
    expect(toggleReaction([{ userId: "me", emoji: "❤️" }], "me", "🔥")).toEqual([{ userId: "me", emoji: "🔥" }]);
    expect(toggleReaction([{ userId: "me", emoji: "🔥" }], "me", "🔥")).toEqual([]);
  });
});

describe("canEditMessage", () => {
  it("allows editing your own sent message for 15 minutes", () => {
    const message = { _id: "m1", senderId: "me", createdAt: new Date(Date.now() - 60_000).toISOString() };
    expect(canEditMessage(message, "me")).toBe(true);
    expect(canEditMessage(message, "friend")).toBe(false);
    expect(canEditMessage({ ...message, _id: "temp-1" }, "me")).toBe(false);
    expect(canEditMessage({ ...message, createdAt: new Date(Date.now() - EDIT_WINDOW_MS - 1000).toISOString() }, "me")).toBe(false);
  });
});
