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
  // Exact equality only — Hostinger MariaDB rejects LIKE across mixed collations.
  const [activeCount, staleCasablanca, hasOulfa] = await Promise.all([
    prisma.city.count({ where: { active: true } }),
    prisma.city.findFirst({
      where: {
        OR: [
          { nameFr: "Casablanca", ozonCityId: 97 },
          { nameFr: "Casablanca", active: true },
        ],
      },
      select: { id: true },
    }),
    prisma.city.findFirst({
      where: {
        nameFr: "Casablanca – Oulfa",
        active: true,
        ozonCityId: { not: null },
      },
      select: { id: true },
    }),
  ]);

  if (activeCount > 0 && !staleCasablanca && hasOulfa) {
    console.log(
      `Cities already present: ${activeCount} active (Casablanca districts OK)`,
    );
    return;
  }

  const cities = await syncImportedCities(prisma);
  console.log(
    `Synced ${cities.length} delivery cities (catalog has ${importedCities.length}).`,
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
