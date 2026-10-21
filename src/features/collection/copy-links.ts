const copyRoutes = {
  CONSOLE: { path: "consoles", label: "console" },
  GAME: { path: "games", label: "game" },
  ACCESSORY: { path: "accessories", label: "accessory" },
} as const;
export function copyLink(type: keyof typeof copyRoutes, id: string) {
  const route = copyRoutes[type];
  return { href: `/app/${route.path}/${id}`, label: `View ${route.label}` };
}
