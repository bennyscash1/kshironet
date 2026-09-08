import Image from "next/image";
import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { APP_LOGO, APP_SLOGAN } from "@/lib/config/app";

/** Centered card shell shared by all auth pages (RTL inherited from root layout). */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        {/* Prominent brand mark above the form, linking home.
            NO WORDMARK LINE UNDER IT: at this size the logo's own lettering is perfectly
            legible, so repeating "כשירונט" directly beneath it just read as a duplicate.
            The slogan takes that slot instead — it is the one thing the mark does not
            already say, and login/signup is exactly where it belongs.
            Height-driven classes with `w-auto` keep the artwork's ratio at every
            breakpoint. */}
        <Link href="/" className="flex flex-col items-center gap-2">
          <Image
            src={APP_LOGO.src}
            alt={APP_LOGO.alt}
            width={APP_LOGO.width}
            height={APP_LOGO.height}
            priority
            className="h-24 sm:h-28 md:h-32 w-auto"
          />
          <span className="text-sm font-semibold tracking-wide text-muted-foreground">
            {APP_SLOGAN}
          </span>
        </Link>
        <Card className="w-full">
          <CardHeader className="text-center">
            <CardTitle className="text-lg">{title}</CardTitle>
            {description && <CardDescription>{description}</CardDescription>}
          </CardHeader>
          <CardContent>{children}</CardContent>
        </Card>
      </div>
    </div>
  );
}
