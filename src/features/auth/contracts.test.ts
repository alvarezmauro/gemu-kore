import { expect, it } from "vitest";
import { isAccessRole } from "./contracts";

it.each(["ADMIN", "EDITOR", "VIEWER"])(
  "recognizes an explicit supported role: %s",
  (role) => {
    expect(isAccessRole(role)).toBe(true);
  },
);
it.each(["admin", "OWNER", "", null, undefined, 1])(
  "rejects an unknown role: %s",
  (role) => {
    expect(isAccessRole(role)).toBe(false);
  },
);
