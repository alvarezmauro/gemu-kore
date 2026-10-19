"use client";
import type { ComponentProps } from "react";
import { CopyConfirm } from "@/features/collection/components/copy-confirm";
import { submitConsoleChange } from "../client";
export function ConsoleConfirm(
  props: Omit<ComponentProps<typeof CopyConfirm>, "submit">,
) {
  return <CopyConfirm {...props} submit={submitConsoleChange} />;
}
