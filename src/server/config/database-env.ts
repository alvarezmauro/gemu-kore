import { z } from "zod";

// Shared with the Node.js Prisma CLI; this module contains no environment values.
export const databaseUrlSchema = z.string().refine((value) => {
  try {
    const url = new URL(value);
    return (
      ["postgresql:", "postgres:"].includes(url.protocol) &&
      url.hostname.length > 0 &&
      url.pathname.length > 1 &&
      (url.searchParams.get("schema") ?? "public").length > 0
    );
  } catch {
    return false;
  }
});
