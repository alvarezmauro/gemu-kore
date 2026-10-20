"use client";
import { cartridgeFormatLabel } from "@/features/physical-media/template-metadata";
import { useState } from "react";
import { ModelViewer } from "@/components/three/model-viewer";
import { loadGameCartridge } from "@/features/physical-media/actions";
import type { MediaComponent } from "@/features/physical-media/contracts";
import { loadGameBox } from "../actions";
import type { PackagingComponent } from "../contracts";
import { boxFormatLabels } from "@/lib/three/packaging-contracts";
export function GamePackaging({
  id,
  copyRevision,
  releaseRevision,
  components,
}: {
  id: string;
  copyRevision: number;
  releaseRevision: number;
  components: (PackagingComponent | MediaComponent)[];
}) {
  const [selected, setSelected] = useState(
    components.find((c) => c.available)?.id ?? components[0]?.id ?? "",
  );
  const component = components.find((c) => c.id === selected) ?? components[0];
  return (
    <div className="min-w-0 space-y-4">
      <p className="text-sm text-muted-foreground">
        Expected catalog packaging and media. Component presence is not tracked;
        this preview does not show your copy’s condition or confirm that its
        components are present.
      </p>
      {components.length > 1 && (
        <div className="space-y-2">
          <label htmlFor="package-component">
            {components.some((c) => "media" in c)
              ? "Expected component to preview"
              : "Expected package to preview"}
          </label>
          <select
            id="package-component"
            className="min-h-12 w-full rounded-lg border border-input bg-background px-3"
            value={component?.id ?? ""}
            onChange={(e) => setSelected(e.target.value)}
          >
            {components.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {component ? (
        <div className="space-y-3">
          <h3 className="font-heading text-xl">{component.name}</h3>
          <p className="text-sm [overflow-wrap:anywhere]">
            {component.templateName ?? "No template assigned"}
            {component.familyKey
              ? ` · ${component.familyKey === "cartridge" ? ("media" in component && component.format ? cartridgeFormatLabel(component.format) : "Cartridge") : boxFormatLabels[component.familyKey]}`
              : ""}
            {component.synthetic
              ? " · Synthetic demonstration; not retail measurements"
              : ""}
          </p>
          <p className="text-sm">{component.notice}</p>
          <ModelViewer
            key={`${component.id}:${copyRevision}:${releaseRevision}`}
            title={component.name}
            source={
              "media" in component
                ? "Expected catalog media"
                : "Expected catalog packaging"
            }
            available={component.available}
            load={() =>
              ("media" in component ? loadGameCartridge : loadGameBox)({
                collectionItemId: id,
                componentId: component.id,
                expectedCopyRevision: copyRevision,
                expectedReleaseRevision: releaseRevision,
              })
            }
          />
        </div>
      ) : (
        <p>
          No packaging or media component is recorded. Expected contents remain
          available below.
        </p>
      )}
    </div>
  );
}
