import "dotenv/config";
import { defineConfig } from "prisma/config";

// Generate only needs a syntactically valid URL. Runtime still requires a real
// DATABASE_URL via the app (see src/lib/prisma.ts).
const datasourceUrl =
  process.env.DATABASE_URL?.trim() ||
  "mysql://tijara:tijara@127.0.0.1:3307/tijara";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    url: datasourceUrl,
  },
});
