import { expect, it } from "vitest";
import {
  emptyPlaytimeDraft,
  formatPlaytime,
  parsePlaytimeDraft,
  playtimeDraft,
  playtimeMutation,
  playtimeSet,
} from "./playtime-validation";
const estimates = {
  mainMinutes: 0,
  mainExtrasMinutes: null,
  completionistMinutes: 181,
  sourceType: "MANUAL" as const,
  sourceName: "My estimate",
  sourceUrl: null,
  observedAt: "2024-02-29T16:20:30.000Z",
};
it("preserves unknowns, zero, source timestamps and complete-set semantics", () => {
  expect(playtimeSet.parse(estimates)).toEqual(estimates);
  expect(parsePlaytimeDraft(playtimeDraft(estimates), estimates)).toEqual(
    estimates,
  );
  expect(
    parsePlaytimeDraft(
      { ...playtimeDraft(estimates), recordedOn: "2024-03-01" },
      estimates,
    ).observedAt,
  ).toBe("2024-03-01T00:00:00.000Z");
  expect(
    playtimeSet.parse({
      ...estimates,
      mainMinutes: null,
      completionistMinutes: null,
    }),
  ).toMatchObject({
    mainMinutes: null,
    mainExtrasMinutes: null,
    completionistMinutes: null,
  });
});
it.each([-1, 1.5, Number.NaN, Infinity, 2147483648, "60"])(
  "rejects invalid stored minutes %s",
  (mainMinutes) => {
    expect(playtimeSet.safeParse({ ...estimates, mainMinutes }).success).toBe(
      false,
    );
  },
);
it.each(["-1", "1.5", "1e3", "+5", "2147483648", "12345678901"])(
  "rejects invalid entered minutes %s",
  (mainMinutes) => {
    expect(() =>
      parsePlaytimeDraft({ ...playtimeDraft(estimates), mainMinutes }),
    ).toThrow();
  },
);
it("normalizes a source URL, requires a source/date and rejects unsafe or excessive values", () => {
  expect(
    playtimeSet.parse({
      ...estimates,
      sourceUrl: "https://EXAMPLE.com/playtime#section",
      observedAt: "2024-02-29T18:20:30+02:00",
    }),
  ).toMatchObject({
    sourceUrl: "https://example.com/playtime",
    observedAt: estimates.observedAt,
  });
  for (const sourceUrl of [
    "javascript:alert(1)",
    "data:text/html,test",
    "https://user:pass@example.com/",
    "https://example.com/" + "x".repeat(2048),
  ])
    expect(playtimeSet.safeParse({ ...estimates, sourceUrl }).success).toBe(
      false,
    );
  for (const sourceName of ["", " ", "x".repeat(201)])
    expect(playtimeSet.safeParse({ ...estimates, sourceName }).success).toBe(
      false,
    );
  for (const recordedOn of ["", "2023-02-29", "2024-13-01", "0000-01-01"])
    expect(() =>
      parsePlaytimeDraft({ ...playtimeDraft(estimates), recordedOn }),
    ).toThrow("valid recorded date");
  expect(playtimeDraft(null)).toEqual(emptyPlaytimeDraft);
});
it("requires explicit review and strict, typed catalog targets", () => {
  const input = {
    kind: "game",
    id: "981e6d4d-a8a3-46bb-b9eb-2a697b2b08a7",
    expectedRevision: 1,
    estimates: { ...estimates, sourceType: "PROVIDER" },
    reviewed: true,
  };
  expect(playtimeMutation.safeParse(input).success).toBe(true);
  for (const change of [
    { reviewed: false },
    { reviewed: undefined },
    { expectedRevision: 0 },
    { kind: "copy" },
    { actorId: input.id },
    { estimates: { ...estimates, confidence: 1 } },
  ])
    expect(playtimeMutation.safeParse({ ...input, ...change }).success).toBe(
      false,
    );
});
it.each([
  [null, "Unknown"],
  [0, "0 min"],
  [45, "45 min"],
  [60, "1 hr"],
  [181, "3 hr 1 min"],
] as const)(
  "formats %s as %s without treating zero as missing",
  (value, label) => {
    expect(formatPlaytime(value)).toBe(label);
  },
);
