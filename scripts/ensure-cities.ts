import "dotenv/config";

import { PrismaMariaDb } from "@prisma/adapter-mariadb";
import { PrismaClient } from "@prisma/client";

import { importedCities } from "../prisma/cities-data";
import { syncImportedCities } from "../prisma/cities";

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required");

const prisma = new PrismaClient({
  adapter: new PrismaMariaDb(connectionString),
});

async function main() {
  const existing = await prisma.city.count({ where: { active: true } });
  if (existing > 0) {
    console.log(`Cities already present: ${existing} active`);
    return;
  }
  const cities = await syncImportedCities(prisma);
  console.log(
    `Seeded ${cities.length} delivery cities (catalog has ${importedCities.length}).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
