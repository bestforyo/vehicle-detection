import "reflect-metadata";
import { randomUUID } from "node:crypto";
import helmet from "helmet";
import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";
import { AppModule } from "./app.module";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  const config = app.get(ConfigService);
  const allowedOrigins = config.getOrThrow<string>("WEB_ORIGINS")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.use(helmet());
  app.enableCors({
    origin: (origin: string | undefined, callback: (error: Error | null, allow?: boolean) => void) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin is not allowed by CORS."), false);
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "Idempotency-Key", "If-Match"],
    exposedHeaders: ["ETag", "X-Request-Id"],
    maxAge: 600,
  });
  app.use((request: { headers: Record<string, string | undefined>; id?: string }, response: { setHeader: (name: string, value: string) => void }, next: () => void) => {
    const suppliedId = request.headers["x-request-id"];
    request.id = suppliedId && /^[A-Za-z0-9._-]{1,80}$/.test(suppliedId) ? suppliedId : randomUUID();
    response.setHeader("X-Request-Id", request.id);
    next();
  });
  app.setGlobalPrefix("api/v1", { exclude: ["health/live", "health/ready"] });
  app.useGlobalPipes(new ValidationPipe({
    whitelist: true,
    forbidNonWhitelisted: true,
    transform: true,
    transformOptions: { enableImplicitConversion: false },
  }));
  app.enableShutdownHooks();

  if (config.get("NODE_ENV") !== "production") {
    const swagger = new DocumentBuilder()
      .setTitle("鉴见车辆检测 API")
      .setDescription("API 契约；示例数据不代表经过审核的生产检测模板。")
      .setVersion("1.0")
      .addBearerAuth()
      .build();
    SwaggerModule.setup("api/docs", app, SwaggerModule.createDocument(app, swagger));
  }

  await app.listen(config.getOrThrow<number>("PORT"), "0.0.0.0");
}

void bootstrap();
