import { z } from "zod";

const moroccanPhone = /^(?:0[67]|\+212[67])\d{8}$/;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
  remember: z.boolean().default(true),
  turnstileToken: z.string().optional(),
});

export const signupSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().toLowerCase().pipe(z.email()),
  phone: z.string().trim().regex(moroccanPhone),
  socialPage: z
    .string()
    .trim()
    .max(300)
    .transform((value) => {
      if (value.startsWith("@"))
        return `https://instagram.com/${value.slice(1)}`;
      if (!/^https?:\/\//i.test(value)) return `https://${value}`;
      return value;
    })
    .pipe(z.url()),
  city: z.string().trim().min(2).max(100),
  password: z.string().min(10).max(128),
  terms: z.literal(true),
  turnstileToken: z.string().optional(),
});
