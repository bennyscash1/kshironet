"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { MailCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { signupSchema, type SignupFormValues } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function SignupForm() {
  const [submitting, setSubmitting] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<SignupFormValues>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      full_name: "",
      email: "",
      password: "",
      confirmPassword: "",
      requested_role_text: "",
      requested_battalion_text: "",
    },
  });

  async function onSubmit(values: SignupFormValues) {
    setSubmitting(true);
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({
      email: values.email,
      password: values.password,
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
        data: {
          full_name: values.full_name,
          // Carried into the users row by ensureUser on first sign-in. Indication for
          // the approving admin only — never a source of authorization.
          requested_role_text: values.requested_role_text?.trim() || null,
          requested_battalion_text: values.requested_battalion_text?.trim() || null,
        },
      },
    });
    setSubmitting(false);

    if (error) {
      const message = /already registered|already exists/i.test(error.message)
        ? "כתובת האימייל כבר רשומה במערכת"
        : "ההרשמה נכשלה, נסו שוב";
      toast.error(message);
      return;
    }

    // If email confirmation is disabled, a session is returned immediately.
    if (data.session) {
      toast.success("נרשמת בהצלחה");
      // Hard navigation so the server sees the new session cookie immediately.
      window.location.assign("/");
      return;
    }

    setEmailSent(true);
    toast.success("נשלח אימייל אימות");
  }

  if (emailSent) {
    return (
      <div className="space-y-4 text-center">
        <MailCheck className="mx-auto size-10 text-primary" />
        <p className="text-sm text-muted-foreground">
          נשלח אליך אימייל לאימות הכתובת. יש ללחוץ על הקישור שבמייל כדי להשלים את
          ההרשמה, ולאחר מכן להתחבר.
        </p>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">חזרה להתחברות</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor="full_name">שם מלא</Label>
        <Input id="full_name" autoComplete="name" {...register("full_name")} />
        {errors.full_name && (
          <p className="text-xs text-destructive">{errors.full_name.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">אימייל</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          dir="ltr"
          placeholder="name@example.com"
          {...register("email")}
        />
        {errors.email && (
          <p className="text-xs text-destructive">{errors.email.message}</p>
        )}
      </div>

      {/* Free text only — no dropdown and no validation against the battalion list.
          These reach the admin as an indication when approving the account. */}
      <div className="space-y-1.5">
        <Label htmlFor="requested_role_text">תפקיד</Label>
        <Input
          id="requested_role_text"
          placeholder="לדוגמה: קצין הסמכות גדודי"
          {...register("requested_role_text")}
        />
        {errors.requested_role_text && (
          <p className="text-xs text-destructive">{errors.requested_role_text.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="requested_battalion_text">גדוד</Label>
        <Input
          id="requested_battalion_text"
          placeholder="לדוגמה: גדוד 9308"
          {...register("requested_battalion_text")}
        />
        {errors.requested_battalion_text && (
          <p className="text-xs text-destructive">
            {errors.requested_battalion_text.message}
          </p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="password">סיסמה</Label>
        <Input
          id="password"
          type="password"
          autoComplete="new-password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">אימות סיסמה</Label>
        <Input
          id="confirmPassword"
          type="password"
          autoComplete="new-password"
          {...register("confirmPassword")}
        />
        {errors.confirmPassword && (
          <p className="text-xs text-destructive">
            {errors.confirmPassword.message}
          </p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "נרשם…" : "הרשמה"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        כבר יש לך חשבון?{" "}
        <Link href="/login" className="font-medium text-primary hover:underline">
          התחברות
        </Link>
      </p>
    </form>
  );
}
