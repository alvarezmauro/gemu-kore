"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Navigation, type NavigationItem } from "./navigation";

export function MobileNavigation({
  items,
  context,
}: {
  items: readonly NavigationItem[];
  context: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="Open navigation"
          className="lg:hidden"
        >
          <Menu aria-hidden="true" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-[min(320px,calc(100%-24px))]!">
        <SheetHeader className="p-6 pr-16">
          <SheetTitle>GemuKore</SheetTitle>
          <SheetDescription>{context}</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">
          <Navigation items={items} onNavigate={() => setOpen(false)} />
        </div>
      </SheetContent>
    </Sheet>
  );
}
