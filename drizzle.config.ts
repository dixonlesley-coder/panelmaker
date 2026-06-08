import { defineConfig } from 'drizzle-kit';

/**
 * drizzle-kit configuration. Generates SQLite migrations from the schema into
 * `src/main/db/migrations`, which `migrate.ts` applies at runtime (falling back
 * to an idempotent bootstrap when no migrations exist).
 */
export default defineConfig({
  dialect: 'sqlite',
  schema: './src/main/db/schema.ts',
  out: './src/main/db/migrations',
  strict: true,
  verbose: true,
});
