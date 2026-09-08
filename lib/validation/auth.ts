import { z } from "zod";

const email = z.string().min(1, "יש להזין כתובת אימייל").email("כתובת אימייל לא תקינה");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "יש להזין סיסמה"),
});

export type LoginFormValues = z.infer<typeof loginSchema>;

export const signupSchema = z
  .object({
    full_name: z.string().min(2, "יש להזין שם מלא"),
    email,
    password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים"),
    confirmPassword: z.string().min(1, "יש לאשר את הסיסמה"),
    // Free text, deliberately unvalidated and NOT checked against the battalion list:
    // these are an indication for the admin who approves the account, and never
    // determine the role or battalion the user receives.
    requested_role_text: z.string().max(200, "הטקסט ארוך מדי").optional(),
    requested_battalion_text: z.string().max(200, "הטקסט ארוך מדי").optional(),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "הסיסמאות אינן תואמות",
    path: ["confirmPassword"],
  });

export type SignupFormValues = z.infer<typeof signupSchema>;

export const resetRequestSchema = z.object({
  email,
});

export type ResetRequestFormValues = z.infer<typeof resetRequestSchema>;

export const updatePasswordSchema = z
  .object({
    password: z.string().min(8, "הסיסמה חייבת להכיל לפחות 8 תווים"),
    confirmPassword: z.string().min(1, "יש לאשר את הסיסמה"),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "הסיסמאות אינן תואמות",
    path: ["confirmPassword"],
  });

export type UpdatePasswordFormValues = z.infer<typeof updatePasswordSchema>;
