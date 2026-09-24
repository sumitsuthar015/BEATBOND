import { describe, expect, it } from "vitest";
import { avatarUrl } from "@/lib/avatar";
import { cn } from "@/lib/utils";

const decode = (url: string) => decodeURIComponent(url.replace("data:image/svg+xml;charset=UTF-8,", ""));

describe("avatarUrl", () => {
  it("renders a self-contained SVG data URL using the chosen colours", () => {
    const url = avatarUrl({ gender: "female", options: { skinColor: "aa7755", hair: "curly" } }, "riya");
    const svg = decode(url);

    expect(url.startsWith("data:image/svg+xml")).toBe(true);
    expect(svg).toContain('fill="#aa7755"');
    expect(svg).toContain('aria-label="Custom avatar riya"');
  });

  it("falls back to safe defaults when no config or an invalid option is given", () => {
    const svg = decode(avatarUrl({ gender: "male", options: { hair: "not-a-style" } }));

    expect(svg).toContain('fill="#f2d3b1"');
    expect(decode(avatarUrl(null))).toContain("<svg");
  });
});

describe("cn", () => {
  it("merges class names and lets later Tailwind classes win", () => {
    expect(cn("px-2 text-sm", null, undefined, { hidden: false }, "px-4")).toBe("text-sm px-4");
  });
});
