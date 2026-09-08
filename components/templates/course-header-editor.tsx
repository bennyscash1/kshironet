"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

export function CourseHeaderEditor({
  urlName,
  initialName,
  initialDomain,
}: {
  urlName: string;
  initialName: string;
  initialDomain: string | null;
}) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [name, setName] = useState(initialName);
  const [domain, setDomain] = useState(initialDomain ?? "");

  async function save(nextName: string, nextDomain: string) {
    const trimmedName = nextName.trim();
    if (!trimmedName) {
      setName(initialName);
      return;
    }
    const res = await fetch(`/api/templates/course/${encodeURIComponent(urlName)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: trimmedName, domain: nextDomain }),
    });
    if (!res.ok) {
      toast.error("שמירה נכשלה");
      return;
    }
    const data = (await res.json()) as { name: string };
    if (data.name !== urlName) {
      router.push(`/templates/course/${encodeURIComponent(data.name)}`);
    }
    startTransition(() => router.refresh());
  }

  return (
    <div>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onBlur={() => {
          if (name.trim() !== initialName) save(name, domain);
        }}
        className="text-2xl font-bold bg-transparent border-0 border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none px-0 py-0.5 w-full max-w-md"
      />
      <input
        value={domain}
        onChange={(e) => setDomain(e.target.value)}
        onBlur={() => {
          if (domain.trim() !== (initialDomain ?? "")) save(name, domain);
        }}
        placeholder="קטגוריה / תחום"
        className="text-muted-foreground text-sm bg-transparent border-0 border-b border-transparent hover:border-muted-foreground/30 focus:border-primary focus:outline-none px-0 py-0.5 w-full max-w-xs mt-1"
      />
    </div>
  );
}
