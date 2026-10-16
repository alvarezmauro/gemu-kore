"use client";
import { useState, useTransition } from "react";
import { AlertDialog } from "radix-ui";
import { Button } from "@/components/ui/button";
import { submitConsoleChange } from "../client";
export function ConsoleConfirm({
  label,
  title,
  description,
  input,
  done,
}: {
  label: string;
  title: string;
  description: string;
  input: Record<string, unknown>;
  done: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [request, setRequest] = useState(input);
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();
  return (
    <AlertDialog.Root
      open={open}
      onOpenChange={(value) => {
        if (pending) return;
        setOpen(value);
        setError("");
        if (value) setRequest(input);
      }}
    >
      <AlertDialog.Trigger asChild>
        <Button
          variant="outline"
          className="h-auto min-h-11 max-w-full whitespace-normal [overflow-wrap:anywhere]"
        >
          {label}
        </Button>
      </AlertDialog.Trigger>
      <AlertDialog.Portal>
        <AlertDialog.Overlay className="motion-overlay fixed inset-0 z-50 bg-black/40" />
        <AlertDialog.Content className="motion-dialog fixed top-1/2 left-1/2 z-50 grid w-full max-w-[calc(100%-2rem)] max-h-[calc(100dvh-2rem)] -translate-x-1/2 -translate-y-1/2 gap-4 overflow-y-auto rounded-xl border bg-popover p-6 text-popover-foreground shadow-md sm:max-w-lg">
          <AlertDialog.Title className="font-heading text-xl">
            {title}
          </AlertDialog.Title>
          <AlertDialog.Description className="break-words text-sm text-muted-foreground">
            {description}
          </AlertDialog.Description>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
            <AlertDialog.Cancel asChild>
              <Button variant="outline" disabled={pending}>
                Cancel
              </Button>
            </AlertDialog.Cancel>
            <AlertDialog.Action asChild>
              <Button
                variant="destructive"
                className="h-auto min-h-11 max-w-full whitespace-normal [overflow-wrap:anywhere]"
                disabled={pending}
                onClick={(e) => {
                  e.preventDefault();
                  startTransition(async () => {
                    const result = await submitConsoleChange(request);
                    if (result.status === "error") setError(result.message);
                    else {
                      setOpen(false);
                      done();
                    }
                  });
                }}
              >
                {pending ? "Saving…" : label}
              </Button>
            </AlertDialog.Action>
          </div>
        </AlertDialog.Content>
      </AlertDialog.Portal>
    </AlertDialog.Root>
  );
}
