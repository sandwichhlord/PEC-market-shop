import "dotenv/config";
import { defineConfig } from "prisma/config";

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Not `env("DATABASE_URL")`: that throws when the variable is unset, which breaks `prisma generate` (run by
    // `npm install`'s postinstall) in a fresh clone before `.env` exists. Commands that connect still fail clearly.
    url: process.env.DATABASE_URL ?? "",
  },
});
