import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { importedCities } from "./cities-data";
import { syncImportedCities } from "./cities";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(connectionString),
});

async function main() {
  await syncImportedCities(prisma);
  console.log(
    `Cities synchronized: ${importedCities.length} active delivery locations; cities used by existing orders were preserved.`,
  );
}

main().finally(() => prisma.$disconnect());
