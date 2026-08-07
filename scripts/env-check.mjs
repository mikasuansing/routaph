#!/usr/bin/env node
/**
 * Fails fast if any required environment variable is missing.
 * Run before starting the app in production.
 */
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const envPath = join(__dirname, '..', '.env.local');

if (existsSync(envPath)) {
  const contents = readFileSync(envPath, 'utf8');
  for (const rawLine of contents.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const equalsIndex = line.indexOf('=');
    if (equalsIndex === -1) continue;
    const key = line.slice(0, equalsIndex).trim();
    const value = line.slice(equalsIndex + 1).trim();
    if (key && (process.env[key] === undefined || process.env[key] === '')) {
      process.env[key] = value;
    }
  }
}

const REQUIRED = [
  'NEXT_PUBLIC_SUPABASE_URL',
  'NEXT_PUBLIC_SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'UPSTASH_REDIS_REST_URL',
  'UPSTASH_REDIS_REST_TOKEN',
];

const missing = REQUIRED.filter(k => !process.env[k]);

if (missing.length > 0) {
  console.error('ERROR: Missing required environment variables:');
  missing.forEach(k => console.error(`  - ${k}`));
  console.error('\nCopy .env.example to .env.local and fill in the values.');
  process.exit(1);
}

console.log('✓ All required environment variables are set.');
process.exit(0);
