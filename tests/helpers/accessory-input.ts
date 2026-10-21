import {
  emptyAccessory,
  emptyVariant,
} from "../../src/features/accessories/validation";
export const accessoryInput = () => ({
  kind: "accessory" as const,
  fields: { ...emptyAccessory, name: "Controller", slug: "controller" },
  references: [],
});
export const variantInput = (accessoryId: string) => ({
  kind: "variant" as const,
  fields: {
    ...emptyVariant,
    name: "Black",
    slug: "controller-black",
    accessoryId,
    regionIds: [],
    platforms: [],
  },
  references: [],
});
