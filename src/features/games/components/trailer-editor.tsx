"use client";
import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  parseTrailerInput,
  type TrailerReference,
} from "../trailer-validation";
import { changeTrailer } from "../trailer-actions";
import { TrailerPlayer } from "./trailer-player";
type TrailerEditorRecord = {
  id: string;
  kind: "game" | "release";
  revision: number;
  archived: boolean;
  trailer: TrailerReference | null;
};
export function TrailerEditor({ record }: { record: TrailerEditorRecord }) {
  const router = useRouter();
  const [provider, setProvider] = useState<"YOUTUBE" | "DIRECT_URL">(
    record.trailer?.provider ?? "YOUTUBE",
  );
  const [value, setValue] = useState(
    record.trailer?.provider === "YOUTUBE"
      ? record.trailer.id
      : (record.trailer?.url ?? ""),
  );
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);
  const pending = useRef(false);
  const alert = useRef<HTMLParagraphElement>(null);
  const busy = saving || refreshing;
  useEffect(() => {
    if (error && !busy) alert.current?.focus();
  }, [error, busy]);
  async function save() {
    if (pending.current || busy) return;
    pending.current = true;
    setSaving(true);
    setError("");
    setSaved(false);
    try {
      const trailer = value.trim() ? parseTrailerInput(provider, value) : null;
      const result = await changeTrailer({
        kind: record.kind,
        id: record.id,
        expectedRevision: record.revision,
        trailer,
      });
      if (result.status === "error") setError(result.message);
      else {
        setSaved(true);
        startRefresh(() => router.refresh());
      }
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "We couldn't confirm this change. Refresh to check the saved trailer.",
      );
    } finally {
      pending.current = false;
      setSaving(false);
    }
  }
  return (
    <div
      className="max-w-3xl space-y-6"
      data-trailer-revision={record.revision}
    >
      <p className="text-sm text-muted-foreground">
        {record.kind === "game"
          ? "This is the game default. Releases can supply their own trailer."
          : "A release trailer replaces the game default. Leave the video blank and save to return to the game default."}{" "}
        Changes apply to every copy using this catalog record.
      </p>
      {record.archived && (
        <p>Restore this catalog record before changing its trailer.</p>
      )}
      {error && (
        <p
          ref={alert}
          role="alert"
          tabIndex={-1}
          className="rounded-xl bg-muted p-4 text-sm"
        >
          {error}
        </p>
      )}
      {saved && <p role="status">Trailer saved.</p>}
      <form
        className="space-y-4 rounded-xl bg-card p-5"
        onSubmit={(event) => {
          event.preventDefault();
          void save();
        }}
      >
        <fieldset disabled={busy || record.archived} className="space-y-4">
          <legend className="font-heading text-xl">Trailer reference</legend>
          <div className="space-y-2">
            <label htmlFor="trailer-provider" className="block">
              Video provider
            </label>
            <select
              id="trailer-provider"
              value={provider}
              onChange={(event) => {
                setProvider(event.target.value as typeof provider);
                setValue("");
                setSaved(false);
              }}
              className="block min-h-12 w-full rounded-lg border border-input bg-background px-3"
            >
              <option value="YOUTUBE">YouTube</option>
              <option value="DIRECT_URL">Direct video URL</option>
            </select>
          </div>
          <label className="block space-y-2">
            <span>Video reference</span>
            <Input
              value={value}
              maxLength={2048}
              onChange={(event) => {
                setValue(event.target.value);
                setSaved(false);
              }}
              aria-describedby="trailer-reference-help"
            />
          </label>
          <p
            id="trailer-reference-help"
            className="text-sm text-muted-foreground"
          >
            {provider === "YOUTUBE"
              ? "Enter a YouTube video ID or HTTPS video link."
              : "Enter an HTTPS link to a browser-playable video, such as MP4 or WebM. This app does not download or host it."}{" "}
            Leave blank to remove this reference.
          </p>
          <Button type="submit">
            {busy ? "Saving trailer…" : "Save trailer"}
          </Button>
        </fieldset>
      </form>
      <section aria-labelledby="saved-trailer-title" className="space-y-4">
        <h2 id="saved-trailer-title" className="font-heading text-xl">
          Saved trailer
        </h2>
        <TrailerPlayer
          key={JSON.stringify(record.trailer)}
          trailer={record.trailer}
          title="Saved catalog trailer"
        />
      </section>
    </div>
  );
}
