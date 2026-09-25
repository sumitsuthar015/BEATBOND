import { describe, expect, it } from "vitest";
import { isReloadShortcut } from "@/lib/installedApp";

const key = (value: string, modifiers: { ctrlKey?: boolean; metaKey?: boolean } = {}) => ({
  key: value,
  ctrlKey: modifiers.ctrlKey ?? false,
  metaKey: modifiers.metaKey ?? false,
});

describe("isReloadShortcut", () => {
  it("catches F5 and Ctrl/Cmd+R, including hard reload", () => {
    expect(isReloadShortcut(key("F5"))).toBe(true);
    expect(isReloadShortcut(key("r", { ctrlKey: true }))).toBe(true);
    expect(isReloadShortcut(key("R", { ctrlKey: true }))).toBe(true); // Ctrl+Shift+R
    expect(isReloadShortcut(key("r", { metaKey: true }))).toBe(true);
  });

  it("leaves normal typing alone", () => {
    expect(isReloadShortcut(key("r"))).toBe(false);
    expect(isReloadShortcut(key("R"))).toBe(false);
    expect(isReloadShortcut(key("t", { ctrlKey: true }))).toBe(false);
  });
});
