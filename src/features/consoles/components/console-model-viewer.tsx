"use client";
import { ModelViewer } from "@/components/three/model-viewer";
import type { ModelPoster } from "@/lib/three/contracts";
import { loadConsoleModelView } from "../actions";
export function ConsoleModelViewer({
  id,
  revision,
  title,
  source,
  poster,
}: {
  id: string;
  revision: number;
  title: string;
  source: string;
  poster: ModelPoster | null;
}) {
  return (
    <ModelViewer
      title={title}
      source={source}
      poster={poster}
      load={() => loadConsoleModelView({ id, expectedRevision: revision })}
    />
  );
}
