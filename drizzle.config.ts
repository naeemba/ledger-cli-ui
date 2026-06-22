import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './db/schema',
  out: './db/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
  // Auth tables are package-owned (applied via `next-starter migrate`). Keep
  // drizzle-kit scoped to the app's own tables so it never tries to create or
  // drop the auth schema.
  tablesFilter: [
    'userSetting',
    'template',
    'commodity_price',
    'price_fetch_run',
    'savedView',
  ],
});
