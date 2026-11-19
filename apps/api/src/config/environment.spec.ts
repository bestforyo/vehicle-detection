import { validateEnvironment } from "./environment";

const developmentEnvironment = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/app",
  JWT_ACCESS_SECRET: "a".repeat(32),
  IDENTITY_HASH_SECRET: "b".repeat(32),
  DATA_ENCRYPTION_KEY: "c".repeat(64),
  PUBLIC_REPORT_BASE_URL: "http://localhost:5173",
  WEB_ORIGINS: "http://localhost:5173",
};

describe("validateEnvironment", () => {
  it("accepts a valid development configuration", () => {
    expect(validateEnvironment(developmentEnvironment)).toMatchObject({
      PORT: 3001,
      HOST: "127.0.0.1",
    });
  });

  it("requires secure public endpoints and WeChat credentials in production", () => {
    expect(() => validateEnvironment({
      ...developmentEnvironment,
      NODE_ENV: "production",
    })).toThrow();
  });

  it("accepts HTTPS production origins with required storage and login configuration", () => {
    expect(validateEnvironment({
      ...developmentEnvironment,
      NODE_ENV: "production",
      PUBLIC_REPORT_BASE_URL: "https://reports.example.com",
      WEB_ORIGINS: "https://admin.example.com",
      WECHAT_MINIAPP_APP_ID: "miniapp-id",
      WECHAT_MINIAPP_APP_SECRET: "miniapp-secret",
      S3_ENDPOINT: "https://objects.example.com",
      S3_BUCKET: "private-reports",
      S3_ACCESS_KEY_ID: "restricted-access",
      S3_SECRET_ACCESS_KEY: "restricted-secret",
    }).NODE_ENV).toBe("production");
  });

  it("rejects production origins with paths and non-HTTPS storage", () => {
    expect(() => validateEnvironment({
      ...developmentEnvironment,
      NODE_ENV: "production",
      PUBLIC_REPORT_BASE_URL: "https://reports.example.com",
      WEB_ORIGINS: "https://admin.example.com/dashboard",
      WECHAT_MINIAPP_APP_ID: "miniapp-id",
      WECHAT_MINIAPP_APP_SECRET: "miniapp-secret",
      S3_ENDPOINT: "http://objects.example.com",
      S3_BUCKET: "private-reports",
    })).toThrow();
  });
});
