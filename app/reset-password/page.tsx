import type { Metadata } from "next";
import { pageTitle } from "@/lib/config/app";
import { AuthCard } from "@/components/auth/auth-card";
import { ResetRequestForm } from "@/components/auth/reset-request-form";

export const metadata: Metadata = {
  title: pageTitle("איפוס סיסמה"),
};

export default function ResetPasswordPage() {
  return (
    <AuthCard
      title="איפוס סיסמה"
      description="הזינו את כתובת האימייל ונשלח אליכם קישור לאיפוס"
    >
      <ResetRequestForm />
    </AuthCard>
  );
}
