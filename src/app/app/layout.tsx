import type { ReactNode } from "react";
import { getPrivateWelcomePageData } from "@/features/auth/queries.server";
import { CommandPalette } from "@/features/search/components/command-palette";

export default async function PrivateLayout({
  children,
}: {
  children: ReactNode;
}) {
  const access = await getPrivateWelcomePageData();
  return access.status === "authorized" ? (
    <CommandPalette>{children}</CommandPalette>
  ) : (
    children
  );
}
