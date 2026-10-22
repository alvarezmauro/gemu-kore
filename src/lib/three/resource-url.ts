// Context routes carry use identity, never a public asset/hash lookup.
const uuid = "[0-9a-f-]{36}";
export const publicResourcePattern = new RegExp(
  `^/api/media/public/(?:items/${uuid}/(?:personal|catalog)/${uuid}|components/${uuid}/${uuid}/(?:geometry|[A-Z][A-Z0-9_]{0,63}))$`,
  "i",
);
export function resourceUrl(id: string, url: string) {
  return url === `/api/media/private/${id}` || publicResourcePattern.test(url);
}
