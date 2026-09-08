import type { Metadata } from "next";
import { pageTitle } from "@/lib/config/app";
import { AuthCard } from "@/components/auth/auth-card";
import { SignupForm } from "@/components/auth/signup-form";

export const metadata: Metadata = {
  title: pageTitle("הרשמה"),
};

export default function SignupPage() {
  return (
    <AuthCard title="הרשמה" description="יצירת חשבון חדש למערכת">
      <SignupForm />
    </AuthCard>
  );
}
