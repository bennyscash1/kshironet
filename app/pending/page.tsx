import type { Metadata } from "next";
import { pageTitle } from "@/lib/config/app";
import { redirect } from "next/navigation";
import { Clock, ShieldX } from "lucide-react";
import { getCurrentUser } from "@/lib/auth/user";
import { AuthCard } from "@/components/auth/auth-card";
import { LogoutButton } from "@/components/auth/logout-button";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: pageTitle("החשבון ממתין לאישור"),
};

export default async function PendingPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (user.status === "approved") redirect("/");

  const rejected = user.status === "rejected";

  return (
    <AuthCard
      title={rejected ? "אין גישה למערכת" : "החשבון ממתין לאישור"}
      description={user.email}
    >
      <div className="space-y-4 text-center">
        {rejected ? (
          <ShieldX className="mx-auto size-10 text-destructive" />
        ) : (
          <Clock className="mx-auto size-10 text-primary" />
        )}
        <p className="text-sm text-muted-foreground">
          {rejected
            ? "הגישה לחשבון זה נחסמה. לפרטים נוספים יש לפנות למנהל המערכת."
            : "ההרשמה התקבלה. חשבונך ממתין לאישור מנהל המערכת. לאחר האישור תתאפשר הכניסה למערכת."}
        </p>
        <LogoutButton className="w-full" />
      </div>
    </AuthCard>
  );
}
