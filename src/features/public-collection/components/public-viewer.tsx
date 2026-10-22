"use client";
import { ModelViewer } from "@/components/three/model-viewer";
import { publicViewerPresentation } from "@/lib/three/contracts";
export function PublicViewer({
  itemId,
  componentId,
  title,
}: {
  itemId: string;
  componentId?: string;
  title: string;
}) {
  return (
    <ModelViewer
      audience="public"
      title={title}
      source={componentId ? "Expected catalog component" : "Collection model"}
      load={async () => {
        try {
          const q = componentId ? `?component=${componentId}` : "";
          const response = await fetch(
            `/api/collection/public/${itemId}/presentation${q}`,
            { cache: "no-store", credentials: "omit", redirect: "error" },
          );
          if (response.ok) {
            const data = publicViewerPresentation.safeParse(
              await response.json(),
            );
            if (data.success) return { status: "success", data: data.data };
          }
        } catch {
          /* A denied refresh discards descriptors in the shared viewer. */
        }
        return {
          status: "error",
          message:
            "This 3D preview is unavailable. Refresh the page to see current details.",
        };
      }}
    />
  );
}
