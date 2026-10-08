import Link from "next/link";
import { SearchX } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * The Hebrew 404.
 *
 * Until now `notFound()` rendered Next.js's built-in page, which is English and LTR inside
 * an otherwise Hebrew RTL application. Every `notFound()` in the app reaches here instead.
 *
 * The wording is deliberately identical for two different causes: a URL that never existed,
 * and a battalion that exists in ANOTHER brigade. Distinguishing them would let the URL be
 * used to discover which battalions exist outside the active brigade — see
 * `getBattalionByCode`, which is scoped so both cases return nothing at all.
 */
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 text-center">
      <SearchX className="size-12 text-muted-foreground" />
      <div className="space-y-1">
        <h1 className="text-2xl font-bold">הדף לא נמצא</h1>
        <p className="max-w-md text-sm text-muted-foreground">
          הכתובת שביקשתם אינה קיימת, או שאינה שייכת לחטיבה הפעילה שלכם. אם הגעתם לכאן
          מקישור ישן, ייתכן שהפריט הועבר או שהוסר.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <Button asChild>
          <Link href="/calendar">חזרה ללוח השנה</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/battalions">רשימת הגדודים</Link>
        </Button>
      </div>
    </div>
  );
}
