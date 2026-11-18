import "dotenv/config";
import { PlatformRole, PrismaClient } from "@prisma/client";
import * as argon2 from "argon2";

const prisma = new PrismaClient();

async function seedPlatformAdministrator(): Promise<void> {
  const email = process.env.PLATFORM_BOOTSTRAP_EMAIL?.trim().toLowerCase();
  const password = process.env.PLATFORM_BOOTSTRAP_PASSWORD;
  const displayName = process.env.PLATFORM_BOOTSTRAP_NAME?.trim();
  if (!email || !password || !displayName) {
    throw new Error(
      "Set PLATFORM_BOOTSTRAP_EMAIL, PLATFORM_BOOTSTRAP_PASSWORD, and PLATFORM_BOOTSTRAP_NAME before provisioning the first platform administrator.",
    );
  }
  if (password.length < 16) {
    throw new Error("The initial platform administrator password must contain at least 16 characters.");
  }

  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    throw new Error("A user already exists for PLATFORM_BOOTSTRAP_EMAIL; bootstrap never overwrites an existing account.");
  }

  const passwordHash = await argon2.hash(password, {
    type: argon2.argon2id,
    memoryCost: 19_456,
    timeCost: 2,
    parallelism: 1,
  });
  await prisma.user.create({
    data: {
      displayName,
      email,
      passwordHash,
      platformRole: PlatformRole.SUPER_ADMIN,
    },
  });
}

void seedPlatformAdministrator()
  .then(() => {
    console.info("Initial platform administrator provisioned.");
  })
  .catch((error: unknown) => {
    console.error("Platform administrator provisioning failed.", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
