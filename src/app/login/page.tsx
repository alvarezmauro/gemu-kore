import type { Metadata } from "next";
import { AuthCard } from "@/features/auth/components/auth-card";
import { LoginControls } from "@/features/auth/components/login-controls";
import { getLoginProviders } from "@/features/auth/queries.server";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Sign in · GemuKore" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string | string[] }>;
}) {
  const { error } = await searchParams;
  return (
    <AuthCard
      title="Welcome to GemuKore"
      description="Sign in to your collection."
    >
      <LoginControls
        providers={getLoginProviders()}
        loginFailed={Boolean(error)}
      />
    </AuthCard>
  );
}
