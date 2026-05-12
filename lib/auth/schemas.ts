import { z } from 'zod';

export const signupSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, 'Email is required')
    .email('Please enter a valid email'),
  name: z
    .string()
    .trim()
    .min(1, 'Name is required')
    .max(100, 'Name is too long'),
});

export type SignupInput = z.infer<typeof signupSchema>;

export type FieldErrors<T extends z.ZodTypeAny> = Partial<
  Record<keyof z.infer<T> | 'form', string>
>;

export const collectFieldErrors = <T extends z.ZodTypeAny>(
  error: z.ZodError
): FieldErrors<T> => {
  const out: FieldErrors<T> = {};
  for (const issue of error.issues) {
    const key = (issue.path[0]?.toString() ?? 'form') as keyof FieldErrors<T>;
    if (!out[key]) out[key] = issue.message;
  }
  return out;
};
