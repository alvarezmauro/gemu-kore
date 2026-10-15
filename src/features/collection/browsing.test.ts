import { expect, it } from "vitest";
import { browseQuery, parseBrowseLocation } from "./browsing";
import { collectionControls } from "@/features/search/controls";
it("round trips page and filters without free text or a stored view", () => {
  const controls = collectionControls.parse({
    type: "game",
    hasBox: "false",
    sort: "year-desc",
  });
  expect(browseQuery(controls, 3)).toBe(
    "type=game&hasBox=false&sort=year-desc&page=3",
  );
  expect(
    parseBrowseLocation(new URLSearchParams(browseQuery(controls, 3))),
  ).toEqual({ controls, page: 3 });
  expect(browseQuery(collectionControls.parse({}), 1)).toBe("");
});
it.each([
  "page=0",
  "page=-1",
  "page=1.5",
  "page=01",
  "page=252",
  "page=",
  "page=1&page=2",
  "page=2&q=serial",
  "page=2&view=grid",
  "page=2&platform=a&platform=b",
])("rejects ambiguous or unsupported paging: %s", (query) => {
  expect(parseBrowseLocation(new URLSearchParams(query))).toBeNull();
});
it("accepts the exact service boundary and rejects oversized combined URLs", () => {
  expect(parseBrowseLocation(new URLSearchParams("page=251"))?.page).toBe(251);
  expect(
    parseBrowseLocation(
      new URLSearchParams({ page: "2", platform: "a".repeat(2048) }),
    ),
  ).toBeNull();
});
