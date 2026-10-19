import { z } from "zod";

const youtubeId = /^[A-Za-z0-9_-]{11}$/;
export const trailerReference = z.discriminatedUnion("provider", [
  z.strictObject({
    provider: z.literal("YOUTUBE"),
    id: z.string().regex(youtubeId),
  }),
  z.strictObject({
    provider: z.literal("DIRECT_URL"),
    url: z
      .string()
      .max(2048)
      .transform((value, ctx) => {
        try {
          const url = new URL(value);
          if (url.protocol !== "https:" || url.username || url.password)
            throw new Error();
          url.hash = "";
          if (url.toString().length > 2048) throw new Error();
          return url.toString();
        } catch {
          ctx.issues.push({
            code: "custom",
            input: value,
            message: "Use an HTTPS video URL without credentials.",
          });
          return z.NEVER;
        }
      }),
  }),
]);
export type TrailerReference = z.infer<typeof trailerReference>;
export const trailerTarget = z.strictObject({
  kind: z.enum(["game", "release"]),
  id: z.uuid(),
});
export const trailerMutation = trailerTarget.extend({
  expectedRevision: z.number().int().min(1).max(2147483646),
  trailer: trailerReference.nullable(),
});

// Only recognized video routes can become an embed ID; arbitrary URLs/HTML never can.
export function parseTrailerInput(
  provider: "YOUTUBE" | "DIRECT_URL",
  value: string,
): TrailerReference {
  value = value.trim();
  if (provider === "DIRECT_URL") {
    const parsed = trailerReference.safeParse({ provider, url: value });
    if (!parsed.success)
      throw new Error(
        "Use an HTTPS video URL without credentials, up to 2,048 characters.",
      );
    return parsed.data;
  }
  let id = value;
  if (!youtubeId.test(value)) {
    try {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password || url.port)
        throw new Error();
      const host = url.hostname;
      if (host === "youtu.be") id = url.pathname.slice(1);
      else if (
        [
          "youtube.com",
          "www.youtube.com",
          "m.youtube.com",
          "www.youtube-nocookie.com",
        ].includes(host)
      ) {
        if (url.pathname === "/watch") id = url.searchParams.get("v") ?? "";
        else id = /^\/(?:embed|shorts)\/([^/]+)$/.exec(url.pathname)?.[1] ?? "";
      } else throw new Error();
    } catch {
      throw new Error(
        "Use a YouTube video ID or a recognized HTTPS YouTube video link.",
      );
    }
  }
  const parsed = trailerReference.safeParse({ provider, id });
  if (!parsed.success)
    throw new Error(
      "Use a YouTube video ID or a recognized HTTPS YouTube video link.",
    );
  return parsed.data;
}

export function trailerLinks(trailer: TrailerReference) {
  return trailer.provider === "YOUTUBE"
    ? {
        external: `https://www.youtube.com/watch?v=${trailer.id}`,
        embed: `https://www.youtube-nocookie.com/embed/${trailer.id}?playsinline=1`,
      }
    : { external: trailer.url, embed: trailer.url };
}

export function storedTrailer(row: {
  trailerProvider: string | null;
  trailerId: string | null;
  trailerUrl: string | null;
}): TrailerReference | null {
  const parsed = trailerReference.safeParse(
    row.trailerProvider === "YOUTUBE"
      ? { provider: row.trailerProvider, id: row.trailerId }
      : { provider: row.trailerProvider, url: row.trailerUrl },
  );
  return parsed.success ? parsed.data : null;
}
