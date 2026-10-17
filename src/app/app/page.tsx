import { PaletteTrigger } from "@/features/search/components/command-palette";
import { redirect } from "next/navigation";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
import { getPrivateWelcomePageData } from "@/features/auth/queries.server";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button } from "@/components/ui/button";

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
      <PaletteTrigger />
      <Badge variant="secondary">
        {result.welcome.role === "ADMIN"
          ? "Administrator"
          : result.welcome.role === "EDITOR"
            ? "Editor"
            : "Viewer"}
      </Badge>
      <p className="text-sm text-muted-foreground">
        Browse your collection, add physical consoles and games and organize the
        places where you keep them.
      </p>
      {result.welcome.role !== "VIEWER" && (
        <>
          <Button asChild>
            <Link href="/app/consoles/new">Add console</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/app/games/new">Add game</Link>
          </Button>
        </>
      )}
      <Button asChild variant="outline">
        <Link href="/app/collection">Browse collection</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/app/search">Search collection</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/app/locations">Manage locations</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/app/defects">Manage defects</Link>
      </Button>
      <Button asChild variant="outline">
        <Link href="/app/media">Manage photos</Link>
      </Button>
      {result.welcome.role === "ADMIN" ? (
        <Button asChild variant="outline">
          <Link href="/app/catalog">Manage console catalog</Link>
        </Button>
      ) : null}
      <SignOutButton />
    </AuthCard>
  );
}
