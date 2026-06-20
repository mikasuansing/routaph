#!/usr/bin/env node
/**
 * Fails fast if any required environment variable is missing.
 * Run before starting the app in production.
 */

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
