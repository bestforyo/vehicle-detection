import { z } from "zod";

const booleanFromEnvironment = z
  .enum(["true", "false"])
  .default("false")
  .transform((value) => value === "true");

const environmentSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  HOST: z.string().default("127.0.0.1"),
  DATABASE_URL: z.string().url(),
  JWT_ACCESS_SECRET: z.string().min(32),
  IDENTITY_HASH_SECRET: z.string().min(32),
  DATA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/),
  PUBLIC_REPORT_BASE_URL: z.string().url(),
  WEB_ORIGINS: z.string().min(1),
  WECHAT_MINIAPP_APP_ID: z.string().optional(),
  WECHAT_MINIAPP_APP_SECRET: z.string().optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_REGION: z.string().default("auto"),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: booleanFromEnvironment,
  MAX_UPLOAD_BYTES: z.coerce.number().int().min(1024).max(50 * 1024 * 1024).default(20 * 1024 * 1024),
}).superRefine((environment, context) => {
  const wechatConfigured = Boolean(environment.WECHAT_MINIAPP_APP_ID && environment.WECHAT_MINIAPP_APP_SECRET);
  if (environment.NODE_ENV === "production" && !wechatConfigured) {
    context.addIssue({
      code: "custom",
      path: ["WECHAT_MINIAPP_APP_ID"],
      message: "Production requires a registered WeChat mini-program and its server-side credentials.",
    });
  }

  if (environment.NODE_ENV === "production") {
    if (new URL(environment.PUBLIC_REPORT_BASE_URL).protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["PUBLIC_REPORT_BASE_URL"],
        message: "Production report links must use HTTPS.",
      });
    }

    const origins = environment.WEB_ORIGINS.split(",").map((origin) => origin.trim());
    if (origins.some((origin) => {
      try {
        const parsed = new URL(origin);
        return parsed.protocol !== "https:" || parsed.origin !== origin;
      } catch {
        return true;
      }
    })) {
      context.addIssue({
        code: "custom",
        path: ["WEB_ORIGINS"],
        message: "Production web origins must be exact HTTPS origins without paths or trailing slashes.",
      });
    }

    if (environment.S3_ENDPOINT && new URL(environment.S3_ENDPOINT).protocol !== "https:") {
      context.addIssue({
        code: "custom",
        path: ["S3_ENDPOINT"],
        message: "Production object storage endpoints must use HTTPS.",
      });
    }
  }

  const storageValues = [
    environment.S3_BUCKET,
    environment.S3_ACCESS_KEY_ID,
    environment.S3_SECRET_ACCESS_KEY,
  ];
  if (storageValues.some(Boolean) && !storageValues.every(Boolean)) {
    context.addIssue({
      code: "custom",
      path: ["S3_BUCKET"],
      message: "Configure the object-storage bucket, access key, and secret key together.",
    });
  }

  if (environment.NODE_ENV === "production" && !environment.S3_BUCKET) {
    context.addIssue({
      code: "custom",
      path: ["S3_BUCKET"],
      message: "Production requires private object storage for inspection evidence.",
    });
  }
});

export type Environment = z.infer<typeof environmentSchema>;

export function validateEnvironment(input: Record<string, unknown>): Environment {
  return environmentSchema.parse(input);
}
