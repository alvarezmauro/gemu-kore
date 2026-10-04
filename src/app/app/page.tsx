import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getPrivateWelcomePageData } from "@/features/auth/queries.server";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function PrivateEntryPage() {
  const result = await getPrivateWelcomePageData();
  if (result.status !== "authorized") {
    if (result.status === "UNAUTHENTICATED") redirect("/login");
    if (result.status === "DENIED") redirect("/access-denied");
    return (
      <AuthCard
        title="Access unavailable"
        description="We couldn't check your access right now. Please try again in a moment."
      >
        <SignOutButton />
      </AuthCard>
    );
  }
  return (
    <AuthCard
      title="Your collection"
      description="Your account has access to GemuKore."
    >
      <Badge variant="secondary">
        {result.welcome.role === "ADMIN"
          ? "Administrator"
          : result.welcome.role === "EDITOR"
            ? "Editor"
            : "Viewer"}
      </Badge>
      <p className="text-sm text-muted-foreground">
        Your collection workspace is being prepared. Item management will be
        available as the application takes shape.
      </p>
      <SignOutButton />
    </AuthCard>
  );
}
