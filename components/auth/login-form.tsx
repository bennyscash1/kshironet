"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { loginSchema, type LoginFormValues } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function LoginForm() {
  const [submitting, setSubmitting] = useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(values: LoginFormValues) {
    setSubmitting(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password,
    });
    setSubmitting(false);

    if (error) {
      const message =
        error.message === "Invalid login credentials"
          ? "אימייל או סיסמה שגויים"
          : error.message === "Email not confirmed"
            ? "יש לאשר את כתובת האימייל לפני ההתחברות"
            : "ההתחברות נכשלה, נסו שוב";
      toast.error(message);
      return;
    }

    toast.success("התחברת בהצלחה");
    // Hard navigation so the server sees the freshly-set session cookie on the
    // first request (a soft router.push races the cookie write and can bounce
    // back to /login).
    window.location.assign("/");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
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

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="password">סיסמה</Label>
          <Link
            href="/reset-password"
            className="text-xs text-muted-foreground hover:text-primary transition-colors"
          >
            שכחת סיסמה?
          </Link>
        </div>
        <Input
          id="password"
          type="password"
          autoComplete="current-password"
          {...register("password")}
        />
        {errors.password && (
          <p className="text-xs text-destructive">{errors.password.message}</p>
        )}
      </div>

      <Button type="submit" className="w-full" disabled={submitting}>
        {submitting ? "מתחבר…" : "התחברות"}
      </Button>

      <p className="text-center text-sm text-muted-foreground">
        אין לך חשבון?{" "}
        <Link href="/signup" className="font-medium text-primary hover:underline">
          הרשמה
        </Link>
      </p>
    </form>
  );
}
