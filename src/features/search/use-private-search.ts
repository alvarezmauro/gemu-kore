"use client";
import { useEffect, useRef, useState } from "react";
import { searchInput } from "./validation";

export type SearchState<T> =
  | { status: "idle" | "pending" }
  | { status: "error"; message: string }
  | { status: "ready"; result: T };

export function usePrivateSearch<T>(
  request: (q: string, signal: AbortSignal) => Promise<T>,
) {
  const [q, setQ] = useState("");
  const [state, setState] = useState<SearchState<T>>({ status: "idle" });
  const [attempt, setAttempt] = useState(0);
  const generation = useRef(0);
  const active = useRef<AbortController | null>(null);
  useEffect(() => {
    const input = searchInput.safeParse({ q });
    if (!input.success || [...input.data.q].length < 2) return;
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
            setState({ status: "ready", result });
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted && id === generation.current)
            setState({
              status: "error",
              message:
                error instanceof Error
                  ? error.message
                  : "Search is unavailable.",
            });
        });
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, attempt, request]);
  function update(value: string) {
    generation.current++;
    active.current?.abort();
    setQ(value);
    const input = searchInput.safeParse({ q: value });
    setState(
      !input.success
        ? {
            status: "error",
            message: "Use up to 160 characters and eight words.",
          }
        : [...input.data.q].length < 2
          ? { status: "idle" }
          : { status: "pending" },
    );
  }
  function retry() {
    if (!searchInput.safeParse({ q }).success) return;
    generation.current++;
    active.current?.abort();
    setState({ status: "pending" });
    setAttempt((value) => value + 1);
  }
  return {
    q,
    state,
    update,
    retry,
    valid: searchInput.safeParse({ q }).success,
  };
}
