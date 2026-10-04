"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { authClient } from "../client";

export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  async function signOut() {
    setPending(true);
    setFailed(false);
    try {
      const result = await authClient.signOut();
      if (result.error) throw new Error("Sign-out failed");
      router.replace("/login");
      router.refresh();
    } catch {
      setFailed(true);
      setPending(false);
    }
  }
  return (
    <div className="space-y-3">
      <Button
        variant="outline"
        type="button"
        disabled={pending}
        onClick={() => void signOut()}
      >
        {pending ? "Signing out…" : "Sign out"}
      </Button>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          We couldn&apos;t sign you out. Please try again.
        </p>
      )}
    </div>
  );
}
