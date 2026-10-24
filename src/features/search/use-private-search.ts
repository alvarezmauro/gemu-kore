"use client";
import { useEffect, useRef, useState } from "react";
import { searchInput } from "./validation";

type SearchState<T> =
  | { status: "idle" | "pending" }
  | { status: "error"; message: string }
  | { status: "ready"; result: T };
export function usePrivateSearch<T>(
  request: (q: string, signal: AbortSignal) => Promise<T>,
  mode: { key?: string; browse?: boolean } = {},
) {
  const [q, setQ] = useState("");
  const [saved, setSaved] = useState<{
    key: string;
    value: SearchState<T>;
    request?: typeof request;
  }>({
    key: "",
    value: { status: "idle" },
  });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  const scope = mode.key ?? "";
  const browse = mode.browse ?? false;
  const key = JSON.stringify([scope, q]);
  const parsed = searchInput.safeParse({ q });
  const shouldSearch =
    parsed.success &&
    ([...parsed.data.q].length >= 2 || (browse && parsed.data.q === ""));
  const fallback: SearchState<T> = !parsed.success
    ? { status: "error", message: "Use up to 160 characters and eight words." }
    : { status: shouldSearch ? "pending" : "idle" };
  const state =
    saved.key === key && saved.request === request ? saved.value : fallback;
  useEffect(() => {
    const input = searchInput.safeParse({ q });
    if (
      !input.success ||
      (![...input.data.q].length && !browse) ||
      [...input.data.q].length === 1
    )
      return;
    const controller = new AbortController();
    active.current = controller;
    const id = generation.current;
    const timer = setTimeout(() => {
      void request(
        input.data.q,
        AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
      )
        .then((result) => {
          if (!controller.signal.aborted && id === generation.current)
            setSaved({ key, request, value: { status: "ready", result } });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && id === generation.current)
            setSaved({
              key,
              request,
              value: {
                status: "error",
                message:
                  error instanceof Error
                    ? error.message
                    : "Search is unavailable.",
              },
            });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, attempt, request, browse, key]);
  function update(value: string) {
    if (value === q) return;
    generation.current++;
    active.current?.abort();
    const input = searchInput.safeParse({ q: value });
    setSaved({
      key: JSON.stringify([scope, value]),
      request,
      value: !input.success
        ? {
            status: "error",
            message: "Use up to 160 characters and eight words.",
          }
        : {
            status:
              [...input.data.q].length >= 2 || (browse && input.data.q === "")
                ? "pending"
                : "idle",
          },
    });
    setQ(value);
  }
  function retry() {
    if (!shouldSearch) return;
    generation.current++;
    active.current?.abort();
    setSaved({ key, request, value: { status: "pending" } });
    setAttempt((value) => value + 1);
  }
  return { q, state, update, retry, valid: parsed.success };
}
