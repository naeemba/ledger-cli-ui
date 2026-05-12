import { defineConfig } from 'drizzle-kit';

const DATA_DIR = process.env.DATA_DIR ?? './data';

export default defineConfig({
  schema: './db/schema',
  out: './db/migrations',
  dialect: 'sqlite',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? `${DATA_DIR}/db.sqlite`,
  },
});
