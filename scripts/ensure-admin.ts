import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";
import { hash } from "argon2";

const email =
  process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase() || "admin@tijara.ma";
const password =
  process.env.BOOTSTRAP_ADMIN_PASSWORD?.trim() || "DemoTijara2026!";
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "Admin Tijara";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(connectionString),
});

async function main() {
  const passwordHash = await hash(password, {
    // Lower memory so Hostinger process limits don't kill signup/seed.
    memoryCost: 19_456,
    timeCost: 2,
  });
  const admin = await prisma.user.upsert({
    where: { email },
    update: {
      passwordHash,
      status: "ACTIVE",
      role: "SUPER_ADMIN",
      name,
    },
    create: {
      email,
      name,
      passwordHash,
      status: "ACTIVE",
      role: "SUPER_ADMIN",
      preferredLocale: "FR",
    },
  });
  console.log(`Admin ready: ${admin.email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
