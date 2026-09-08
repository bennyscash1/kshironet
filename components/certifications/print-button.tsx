"use client";

import { Button } from "@/components/ui/button";
import { Printer } from "lucide-react";

export function PrintButton() {
  return (
    <div className="no-print mb-4">
      <Button onClick={() => window.print()}>
        <Printer className="size-4" />
        הדפס / שמור כ-PDF
      </Button>
    </div>
  );
}
