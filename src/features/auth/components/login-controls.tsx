"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { authClient } from "../client";

export function LoginControls({
  providers,
  loginFailed,
}: {
  providers: { google: boolean; github: boolean };
  loginFailed: boolean;
}) {
  const [pending, setPending] = useState<"google" | "github" | null>(null);
  const [error, setError] = useState(
    loginFailed
      ? "We couldn't complete sign-in. Please try again with your verified account."
      : "",
  );

  async function signIn(provider: "google" | "github") {
    setPending(provider);
    setError("");
    try {
      const result = await authClient.signIn.social({
        provider,
        callbackURL: "/app",
        errorCallbackURL: "/login",
        newUserCallbackURL: "/app",
      });
      if (result.error)
        setError("We couldn't start sign-in. Please try again.");
    } catch {
      setError("We couldn't start sign-in. Please try again.");
    } finally {
      setPending(null);
    }
  }

  const configured = providers.google || providers.github;
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3">
        {(["google", "github"] as const).map((provider) => (
          <Button
            key={provider}
            type="button"
            variant={provider === "google" ? "default" : "outline"}
            disabled={!providers[provider] || pending !== null}
            onClick={() => void signIn(provider)}
          >
            {pending === provider
              ? "Opening sign-in…"
              : `Continue with ${provider === "google" ? "Google" : "GitHub"}`}
          </Button>
        ))}
      </div>
      {!configured && (
        <p className="text-sm text-muted-foreground">
          Sign-in hasn&apos;t been set up yet. Please contact the collection
          administrator.
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <p className="text-sm text-muted-foreground">
        Use an account with a verified email. Collection access is managed by
        the administrator.
      </p>
    </div>
  );
}
