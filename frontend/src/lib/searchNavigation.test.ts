import { describe, expect, it } from "vitest";
import { getSearchQueryParams } from "@/lib/searchNavigation";

describe("search query URL state", () => {
  it("preserves spaces while the user is still typing", () => {
    expect(getSearchQueryParams("arijit singh ")).toEqual({ q: "arijit singh " });
  });

  it("removes the query parameter for an empty or whitespace-only input", () => {
    expect(getSearchQueryParams("   ")).toEqual({});
    expect(getSearchQueryParams("")).toEqual({});
  });
});
