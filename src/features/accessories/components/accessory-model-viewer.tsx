"use client";
import { ModelViewer } from "@/components/three/model-viewer";
import type { ModelPoster } from "@/lib/three/contracts";
import { loadAccessoryModelView } from "../copy-actions";
export function AccessoryModelViewer({
  id,
  revision,
  selectionKey,
  title,
  source,
  poster,
}: {
  id: string;
  revision: number;
  selectionKey: string;
  title: string;
  source: string;
  poster: ModelPoster | null;
}) {
  return (
    <ModelViewer
      title={title}
      source={source}
      poster={poster}
      load={() =>
        loadAccessoryModelView({ id, expectedRevision: revision, selectionKey })
      }
    />
  );
}
