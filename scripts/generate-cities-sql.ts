import { writeFileSync } from "node:fs";

import { importedCities } from "../prisma/cities-data";

function slug(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function key(name: string) {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function esc(value: string) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "''");
}

const sorted = [...importedCities].sort((left, right) =>
  left.name.localeCompare(right.name, "fr", { sensitivity: "base" }),
);
const counts = new Map<string, number>();
for (const city of sorted) {
  const nameKey = key(city.name);
  counts.set(nameKey, (counts.get(nameKey) ?? 0) + 1);
}

const values = sorted.map((city, index) => {
  const base = slug(city.name) || `city-${city.sourceId}`;
  const citySlug =
    (counts.get(key(city.name)) ?? 0) > 1
      ? `${base}-${city.sourceId}`
      : base;
  const id = `ozoncity${String(city.sourceId).padStart(12, "0")}`;
  return `('${id}', '${esc(city.name)}', '${esc(city.name)}', '${esc(citySlug)}', ${city.sourceId}, '${esc(city.ref)}', ${city.deliveryFee}, 1, ${index}, NOW(3), NOW(3))`;
});

const sql = `SET FOREIGN_KEY_CHECKS=0;
INSERT INTO City (id, nameFr, nameAr, slug, ozonCityId, ozonRef, deliveryFee, active, sortOrder, createdAt, updatedAt) VALUES
${values.join(",\n")}
ON DUPLICATE KEY UPDATE
  nameFr=VALUES(nameFr),
  nameAr=VALUES(nameAr),
  slug=VALUES(slug),
  ozonRef=VALUES(ozonRef),
  deliveryFee=VALUES(deliveryFee),
  active=VALUES(active),
  sortOrder=VALUES(sortOrder),
  updatedAt=VALUES(updatedAt);
SET FOREIGN_KEY_CHECKS=1;
SELECT COUNT(*) AS total, SUM(active=1) AS active, SUM(ozonCityId IS NOT NULL) AS ozon FROM City;
`;

const out = process.argv[2] || "/tmp/tijara-cities.sql";
writeFileSync(out, sql);
console.log(`Wrote ${sorted.length} cities to ${out}`);
