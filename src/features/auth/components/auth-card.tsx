import type { ReactNode } from "react";
import Link from "next/link";
import { ThemeMenu } from "@/components/theme-menu";
import { Card, CardContent, CardHeader } from "@/components/ui/card";

export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between gap-4 px-4 py-4 sm:px-8">
        <Link
          href="/"
          className="font-heading text-xl focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
        >
          GemuKore
        </Link>
        <ThemeMenu />
      </header>
      <main
        id="main-content"
        className="flex flex-1 items-center justify-center px-4 py-10"
      >
        <Card className="w-full max-w-md border">
          <CardHeader>
            <h1 className="font-heading text-3xl tracking-tight">{title}</h1>
            <p className="mt-2 text-body">{description}</p>
          </CardHeader>
          <CardContent className="space-y-5">{children}</CardContent>
        </Card>
      </main>
    </div>
  );
}
