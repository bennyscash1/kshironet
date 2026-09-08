import type { Metadata } from "next";
import { pageTitle } from "@/lib/config/app";
import { AuthCard } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";

export const metadata: Metadata = {
  title: pageTitle("התחברות"),
};

export default function LoginPage() {
  return (
    <AuthCard title="התחברות" description="התחברו לחשבון שלכם כדי להמשיך">
      <LoginForm />
    </AuthCard>
  );
}
