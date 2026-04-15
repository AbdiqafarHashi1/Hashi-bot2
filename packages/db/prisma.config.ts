import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "../../prisma/schema.prisma",
  migrations: {
    path: "../../prisma/migrations"
  },
  engine: "classic",
  datasource: {
    url: process.env.DATABASE_URL ?? "postgresql://postgres:postgres@localhost:5432/hashi_bot2"
  }
});
