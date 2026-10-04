import type { Metadata } from "next";
import Link from "next/link";
import { AuthCard } from "@/features/auth/components/auth-card";
import { SignOutButton } from "@/features/auth/components/sign-out-button";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Access unavailable · GemuKore" };

export default function AccessDeniedPage() {
  return (
    <AuthCard
      title="Access unavailable"
      description="This account doesn't currently have access to the private collection."
    >
      <p className="text-sm text-muted-foreground">
        Contact the collection administrator, or sign out to use a different
        account.
      </p>
      <SignOutButton />
      <Link
        href="/login"
        className="inline-block text-sm text-link underline underline-offset-4"
      >
        Back to sign in
      </Link>
    </AuthCard>
  );
}
