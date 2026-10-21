import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";
export function DashboardUnavailable() {
  return (
    <AuthCard
      title="Overview unavailable"
      description="We couldn't load your collection overview right now. Please try again."
    >
      <p className="text-sm text-muted-foreground">
        Your collection has not been changed.
      </p>
      <a
        className="inline-flex min-h-11 items-center underline underline-offset-4"
        href="/app"
      >
        Try again
      </a>
      <SignOutButton />
    </AuthCard>
  );
}
