import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatePanel } from "./state-panel";

describe("StatePanel", () => {
  it("announces loading politely and marks the content busy", () => {
    const html = renderToStaticMarkup(<StatePanel state="loading" title="Loading flags" />);
    expect(html).toContain('role="status"');
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain('aria-live="polite"');
  });

  it("uses an alert role and renders an optional retry action for errors", () => {
    const html = renderToStaticMarkup(<StatePanel state="error" title="Could not load" actionLabel="Retry" onAction={() => {}} />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("Retry");
  });

  it("renders empty state copy without an action when none is supplied", () => {
    const html = renderToStaticMarkup(<StatePanel state="empty" title="No flags yet" description="Flags appear here." />);
    expect(html).toContain("No flags yet");
    expect(html).toContain("Flags appear here.");
    expect(html).not.toContain("<button");
  });
});

