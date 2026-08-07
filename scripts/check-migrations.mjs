#!/usr/bin/env node
/**
 * Checks that every .sql file in supabase/migrations/ is tracked.
 * CI fails if a migration file exists locally but is not applied remotely.
 * For now, just verify the directory exists and has at least one migration.
 */
import { readdirSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationsDir = join(__dirname, '..', 'supabase', 'migrations');

if (!existsSync(migrationsDir)) {
  console.error('ERROR: supabase/migrations/ directory not found');
  process.exit(1);
}

const files = readdirSync(migrationsDir).filter(f => f.endsWith('.sql'));

if (files.length === 0) {
  console.error('ERROR: No migration files found in supabase/migrations/');
  process.exit(1);
}

console.log(`✓ ${files.length} migration file(s) found:`);
files.forEach(f => console.log(`  - ${f}`));
process.exit(0);
