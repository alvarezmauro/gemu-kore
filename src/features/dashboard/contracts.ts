import type { AccessRole } from "@/features/auth/contracts";
export type DashboardCounts = {
  total: number;
  consoles: number;
  games: number;
  accessories: number;
  boxed: number;
  activeDefects: number;
};
export type RecentItem = {
  id: string;
  type: "CONSOLE" | "GAME" | "ACCESSORY";
  title: string;
  context: string;
  href: string;
  addedAt: string;
  addedLabel: string;
  photo: { url: string; alt: string; width: number; height: number } | null;
};
export type DashboardData = {
  role: AccessRole;
  canManage: boolean;
  counts: DashboardCounts;
  recent: RecentItem[];
  moreRecent: boolean;
};
