import { beforeEach, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  headers: new Headers(),
  context: { serverIdentity: true },
  access: vi.fn(),
  settingsReview: vi.fn(),
  settingsSave: vi.fn(),
  itemReview: vi.fn(),
  itemSave: vi.fn(),
  revalidate: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => state.headers }));
vi.mock("next/cache", () => ({ revalidatePath: state.revalidate }));
vi.mock("@/server/config/env", () => ({
  getAuthEnv: () => ({ baseURL: "https://collection.example" }),
}));
vi.mock("@/server/auth/access", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  requirePrivateAccess: state.access,
}));
vi.mock("@/server/services/public-collection/publication", () => ({
  reviewPublicSettings: state.settingsReview,
  updatePublicSettings: state.settingsSave,
  getItemPublicationReview: state.itemReview,
  setItemPublication: state.itemSave,
}));
import {
  reviewPublicationSettings,
  savePublicationSettings,
  reviewItemPublication,
  saveItemPublication,
} from "./actions";
import { PublicCollectionError } from "@/server/services/public-collection/common";
import { PermissionError } from "@/server/auth/permissions";
const settings = {
  publicCollectionEnabled: true,
  showSerialNumbers: false,
  showLocations: false,
  showNotes: false,
  showDefects: false,
  showPersonalPhotos: false,
  allowSearchEngineIndexing: false,
};
beforeEach(() => {
  vi.clearAllMocks();
  state.headers = new Headers({
    origin: "https://collection.example",
    "sec-fetch-site": "same-origin",
  });
  state.access.mockResolvedValue(state.context);
  state.settingsReview.mockResolvedValue({
    affectedCopies: 0,
    site: null,
    reviewToken: "a".repeat(32),
  });
  state.settingsSave.mockResolvedValue({ revision: 2, unpublished: 0 });
  state.itemReview.mockResolvedValue({ preview: "public-projection" });
  state.itemSave.mockResolvedValue({ revision: 2 });
});
it.each([null, "https://attacker.example"])(
  "rejects missing or foreign origins before a publication operation: %s",
  async (origin) => {
    if (origin) state.headers.set("origin", origin);
    else state.headers.delete("origin");
    for (const action of [
      reviewPublicationSettings,
      savePublicationSettings,
      reviewItemPublication,
      saveItemPublication,
    ])
      expect((await action({})).status).toBe("error");
    expect(state.settingsReview).not.toHaveBeenCalled();
    expect(state.settingsSave).not.toHaveBeenCalled();
    expect(state.itemReview).not.toHaveBeenCalled();
    expect(state.itemSave).not.toHaveBeenCalled();
  },
);
it("rejects cross-site requests even with an otherwise valid origin", async () => {
  state.headers.set("sec-fetch-site", "cross-site");
  expect((await saveItemPublication({})).status).toBe("error");
  expect(state.itemSave).not.toHaveBeenCalled();
});
it.each(["allowSearchEngineIndexing"] as const)(
  "cannot enable an unfinished capability through action input: %s",
  async (key) => {
    const input = {
      expectedRevision: 1,
      settings: { ...settings, [key]: true },
    };
    expect((await reviewPublicationSettings(input)).status).toBe("error");
    expect(
      (
        await savePublicationSettings({
          ...input,
          reviewed: true,
          reviewToken: "a".repeat(32),
        })
      ).status,
    ).toBe("error");
    expect(state.settingsReview).not.toHaveBeenCalled();
    expect(state.settingsSave).not.toHaveBeenCalled();
  },
);
it("passes the server-created identity, requires reviewed settings and refreshes only successful writes", async () => {
  const input = { expectedRevision: 1, settings };
  expect((await reviewPublicationSettings(input)).status).toBe("success");
  expect(state.settingsReview).toHaveBeenCalledWith(state.context, input);
  expect(
    (
      await savePublicationSettings({
        ...input,
        reviewed: false,
        reviewToken: "a".repeat(32),
      })
    ).status,
  ).toBe("error");
  expect(state.settingsSave).not.toHaveBeenCalled();
  expect(state.revalidate).not.toHaveBeenCalled();
  expect(
    (
      await savePublicationSettings({
        ...input,
        reviewed: true,
        reviewToken: "a".repeat(32),
      })
    ).status,
  ).toBe("success");
  expect(state.revalidate).toHaveBeenCalledWith("/app/settings/public");
});
it("sanitizes unexpected errors and preserves stale-review and revoked-role failures", async () => {
  state.itemSave.mockRejectedValueOnce(
    new Error("postgresql://secret.internal/private"),
  );
  const unexpected = await saveItemPublication({});
  expect(JSON.stringify(unexpected)).not.toMatch(/postgresql|secret.internal/);
  state.itemSave.mockRejectedValueOnce(new PublicCollectionError("STALE"));
  expect(await saveItemPublication({})).toEqual({
    status: "error",
    message: "The reviewed content changed. Review it again before saving.",
  });
  state.itemSave.mockRejectedValueOnce(new PermissionError("FORBIDDEN"));
  expect(await saveItemPublication({})).toMatchObject({
    status: "error",
    message: expect.stringContaining("not permitted"),
  });
  expect(state.revalidate).not.toHaveBeenCalled();
});

it("allows reviewed personal-media settings now that contextual delivery is implemented", async () => {
  const input = {
    expectedRevision: 1,
    settings: { ...settings, showPersonalPhotos: true },
  };
  expect((await reviewPublicationSettings(input)).status).toBe("success");
  expect(state.settingsReview).toHaveBeenCalledWith(state.context, input);
});
