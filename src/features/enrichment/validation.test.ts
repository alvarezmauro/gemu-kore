import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import {
  applyEnrichment,
  chooseEnrichmentCandidate,
  prepareEnrichment,
  startEnrichment,
} from "./validation";
const runId = randomUUID();
const start = {
  target: { kind: "game", id: randomUUID() },
  expectedRevision: 1,
  requestKey: randomUUID(),
  query: " Orbit Quest ",
};
it("normalizes bounded lookup intent without accepting caller authority", () => {
  expect(startEnrichment.parse(start).query).toBe("Orbit Quest");
  for (const patch of [
    { query: "x" },
    { query: "x\nsecret" },
    { query: "x".repeat(201) },
    { expectedRevision: 0 },
    { requestKey: "bad" },
    { role: "ADMIN" },
    { provider: "untrusted" },
    { target: { kind: "copy", id: randomUUID() } },
  ])
    expect(startEnrichment.safeParse({ ...start, ...patch }).success).toBe(
      false,
    );
});
it("requires an explicit retained numeric candidate and current command version", () => {
  expect(
    chooseEnrichmentCandidate.safeParse({
      runId,
      expectedRunVersion: 1,
      externalId: "42",
    }).success,
  ).toBe(true);
  for (const externalId of ["0", "-1", "1.5", "42 OR 1=1", "9".repeat(17)])
    expect(
      chooseEnrichmentCandidate.safeParse({
        runId,
        expectedRunVersion: 1,
        externalId,
      }).success,
    ).toBe(false);
});
it("limits choices to unique typed field groups and explicit local bindings", () => {
  const input = { runId, expectedRunVersion: 1, fields: ["description"] };
  expect(prepareEnrichment.parse(input).companyBindings).toEqual([]);
  for (const fields of [
    [],
    ["rating"],
    ["screenshots"],
    ["description", "description"],
  ])
    expect(prepareEnrichment.safeParse({ ...input, fields }).success).toBe(
      false,
    );
  expect(
    prepareEnrichment.safeParse({
      ...input,
      companyBindings: [{ externalId: "7", companyId: "guessed" }],
    }).success,
  ).toBe(false);
});
it("accepts IDs and a frozen token instead of client-authored values or sources", () => {
  const suggestionId = randomUUID();
  const input = {
    runId,
    reviewToken: "a".repeat(64),
    suggestionIds: [suggestionId],
  };
  expect(applyEnrichment.safeParse(input).success).toBe(true);
  for (const patch of [
    { suggestionIds: [] },
    { suggestionIds: [suggestionId, suggestionId] },
    { reviewToken: "bad" },
    { proposed: "overwrite" },
    { sourceSnapshot: {} },
  ])
    expect(applyEnrichment.safeParse({ ...input, ...patch }).success).toBe(
      false,
    );
});
