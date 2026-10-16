import "server-only";
import { z } from "zod";
import type { PrivateAccessContext } from "@/server/auth/access";
import { requirePermission } from "@/server/auth/permissions";
import { withTransaction } from "@/server/db/transaction";
import * as repository from "@/server/repositories/collection/console-management";
import { modelPresentation, modelSettings } from "@/lib/three/contracts";
import { ConsoleError } from "./consoles";
type Primary = Awaited<
  ReturnType<typeof repository.consolePrimaryOverrides>
>[number];
type Catalog = Awaited<ReturnType<typeof repository.consoleCatalogModel>>;
// One selection policy for the existing download and the interactive presentation.
export function consoleModelFile(primary: Primary[], catalog: Catalog) {
  const copy = primary.find(
    (u) => u.type === "CUSTOM_MODEL" && u.asset.kind === "MODEL_3D",
  );
  const choice = copy
    ? {
        useId: copy.id,
        asset: copy.asset,
        source: "Your copy's custom 3D file",
      }
    : catalog
      ? {
          useId: catalog.id,
          asset: catalog.asset,
          source: catalog.consoleModelId
            ? "Catalog model 3D file"
            : "Inherited platform 3D file",
        }
      : null;
  return choice
    ? { ...choice, url: `/api/media/private/${choice.asset.id}` }
    : null;
}
export async function getConsoleModelPresentation(
  context: PrivateAccessContext,
  input: unknown,
) {
  return withTransaction(
    async (tx) => {
      await requirePermission(context, "private.read", tx);
      const parsed = z
        .object({
          id: z.uuid(),
          expectedRevision: z.number().int().positive().max(2147483647),
        })
        .strict()
        .safeParse(input);
      if (!parsed.success) throw new ConsoleError("INVALID_INPUT");
      const item = await repository.consoleViewerIdentity(parsed.data.id, tx);
      if (!item || item.type !== "CONSOLE" || !item.ownedConsole)
        throw new ConsoleError("NOT_FOUND");
      if (item.revision !== parsed.data.expectedRevision)
        throw new ConsoleError("COPY_STALE");
      const model = item.ownedConsole.consoleModel;
      const primary = await repository.consolePrimaryOverrides(item.id, tx);
      const catalog = await repository.consoleCatalogModel(
        model.id,
        model.platform.id,
        tx,
      );
      const file = consoleModelFile(primary, catalog);
      if (
        !file ||
        file.asset.mimeType !== "model/gltf-binary" ||
        !file.asset.sizeBytes
      )
        throw new ConsoleError(
          "NOT_FOUND",
          "No ready 3D file is available for this console.",
        );
      const photo = await repository.consoleViewerPoster(
        item.id,
        model.id,
        model.platform.id,
        tx,
      );
      return modelPresentation.parse({
        schemaVersion: 1,
        presentationKey: `${item.id}:${item.revision}:${file.useId}:${file.asset.id}:interactive-v1`,
        title: `${model.platform.name} · ${model.name}`,
        description:
          "Interactive catalog or copy artwork. Physical condition and identifying details remain in the console page.",
        source: file.source,
        resource: {
          id: file.asset.id,
          url: file.url,
          mimeType: file.asset.mimeType,
          byteLength: Number(file.asset.sizeBytes),
        },
        poster: photo
          ? {
              url: `/api/media/private/${photo.asset.id}`,
              alt: photo.altText ?? "Console preview",
              width: photo.asset.width ?? 1,
              height: photo.asset.height ?? 1,
            }
          : null,
        settings: modelSettings.parse({ preset: "console" }),
      });
    },
    { isolationLevel: "RepeatableRead" },
  );
}
