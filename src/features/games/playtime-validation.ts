import { z } from "zod";
import { normalizedWebUrl } from "@/features/catalog/validation";
const minutes = z.number().int().min(0).max(2147483647).nullable();
export const playtimeSet = z.strictObject({
  mainMinutes: minutes,
  mainExtrasMinutes: minutes,
  completionistMinutes: minutes,
  sourceType: z.enum(["MANUAL", "PROVIDER"]),
  sourceName: z.string().trim().min(1).max(200),
  sourceUrl: z
    .string()
    .trim()
    .max(2048)
    .nullable()
    .transform((v, ctx) => {
      if (!v) return null;
      try {
        const result = normalizedWebUrl(v);
        if (result.length > 2048) throw new Error();
        return result;
      } catch {
        ctx.issues.push({
          code: "custom",
          input: v,
          message: "Use an HTTP or HTTPS source URL without credentials.",
        });
        return z.NEVER;
      }
    }),
  observedAt: z.iso
    .datetime({ offset: true })
    .refine((v) => Number(v.slice(0, 4)) >= 1, "Use a valid recorded date.")
    .transform((v) => new Date(v).toISOString()),
});
export type PlaytimeSet = z.infer<typeof playtimeSet>;
export type Playtime = PlaytimeSet & { updatedAt: string };
export const playtimeTarget = z.strictObject({
  kind: z.enum(["game", "release"]),
  id: z.uuid(),
});
export const playtimeMutation = playtimeTarget.extend({
  expectedRevision: z.number().int().min(1).max(2147483646),
  estimates: playtimeSet.nullable(),
  reviewed: z.literal(true),
});
export const emptyPlaytimeDraft = {
  mainMinutes: "",
  mainExtrasMinutes: "",
  completionistMinutes: "",
  sourceType: "MANUAL" as "MANUAL" | "PROVIDER",
  sourceName: "",
  sourceUrl: "",
  recordedOn: "",
};
export type PlaytimeDraft = typeof emptyPlaytimeDraft;
export function playtimeDraft(value: PlaytimeSet | null): PlaytimeDraft {
  return value
    ? {
        mainMinutes: value.mainMinutes?.toString() ?? "",
        mainExtrasMinutes: value.mainExtrasMinutes?.toString() ?? "",
        completionistMinutes: value.completionistMinutes?.toString() ?? "",
        sourceType: value.sourceType,
        sourceName: value.sourceName,
        sourceUrl: value.sourceUrl ?? "",
        recordedOn: value.observedAt.slice(0, 10),
      }
    : { ...emptyPlaytimeDraft };
}
export function parsePlaytimeDraft(
  draft: PlaytimeDraft,
  previous?: PlaytimeSet | null,
): PlaytimeSet {
  const number = (v: string) => {
    if (!v.trim()) return null;
    if (!/^\d{1,10}$/.test(v.trim()))
      throw new Error(
        "Use whole minutes from 0 to 2,147,483,647, or leave the duration blank for unknown.",
      );
    return Number(v);
  };
  if (
    !z.iso.date().safeParse(draft.recordedOn).success ||
    Number(draft.recordedOn.slice(0, 4)) < 1
  )
    throw new Error("Use a valid recorded date.");
  const parsed = playtimeSet.safeParse({
    mainMinutes: number(draft.mainMinutes),
    mainExtrasMinutes: number(draft.mainExtrasMinutes),
    completionistMinutes: number(draft.completionistMinutes),
    sourceType: draft.sourceType,
    sourceName: draft.sourceName,
    sourceUrl: draft.sourceUrl,
    observedAt:
      previous && previous.observedAt.slice(0, 10) === draft.recordedOn
        ? previous.observedAt
        : `${draft.recordedOn}T00:00:00.000Z`,
  });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);
  return parsed.data;
}
export function formatPlaytime(minutes: number | null) {
  if (minutes === null) return "Unknown";
  const hours = Math.floor(minutes / 60),
    remainder = minutes % 60;
  return hours
    ? `${hours} hr${remainder ? ` ${remainder} min` : ""}`
    : `${remainder} min`;
}
