import { redirect } from "next/navigation";
import { hasAuthenticatedIdentity } from "@/features/auth/queries.server";

export const dynamic = "force-dynamic";

export default async function PrivateEntryPage() {
  if (!(await hasAuthenticatedIdentity())) redirect("/login");
  // OAuth alone never authorizes private data. Task 3.3 adds the grant gate.
  redirect("/access-denied");
}
