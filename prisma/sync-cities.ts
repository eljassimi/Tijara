import "dotenv/config";

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

import { importedCities } from "./cities-data";
import { syncImportedCities } from "./cities";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString }),
});

async function main() {
  await syncImportedCities(prisma);
  console.log(
    `Cities synchronized: ${importedCities.length} active delivery locations; cities used by existing orders were preserved.`,
  );
}

main().finally(() => prisma.$disconnect());
