#!/usr/bin/env node
/**
 * Bump service worker cache version (CACHE_NAME) in public/sw.js
 *
 * Finds `const CACHE_NAME = 'yes-chef-v<N>'` and increments N.
 * Ensures every frontend deployment invalidates the old cache,
 * so clients fetch the latest STATIC_ASSETS after a deploy.
 *
 * Usage:
 *   node scripts/bump-sw-cache.mjs
 *   node scripts/bump-sw-cache.mjs --check   # exits 1 if no bump needed (for CI dry-run)
 *   node scripts/bump-sw-cache.mjs --set 42  # set to explicit version
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SW_PATH = resolve(__dirname, '../public/sw.js');
const CACHE_RE = /const CACHE_NAME\s*=\s*['"]yes-chef-v(\d+)['"]/;

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--set' && args[i + 1] != null) {
      opts.set = Number.parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--check') {
      opts.check = true;
    } else if (args[i] === '--help' || args[i] === '-h') {
      opts.help = true;
    }
  }
  return opts;
}

function printHelp() {
  console.log(`Usage: node scripts/bump-sw-cache.mjs [options]
Options:
  --set <n>   Set cache version to explicit integer n (e.g. --set 28)
  --check     Dry-run: report current version without modifying file
  --help      Show this help`);
}

function main() {
  const opts = parseArgs();
  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  let content;
  try {
    content = readFileSync(SW_PATH, 'utf8');
  } catch (err) {
    console.error(`error: cannot read ${SW_PATH}: ${err.message}`);
    process.exit(1);
  }

  const match = content.match(CACHE_RE);
  if (!match) {
    console.error(`error: CACHE_NAME pattern not found in ${SW_PATH}`);
    console.error(`  expected: const CACHE_NAME = 'yes-chef-v<N>'`);
    process.exit(1);
  }

  const current = Number.parseInt(match[1], 10);
  if (Number.isNaN(current)) {
    console.error(`error: invalid cache version '${match[1]}'`);
    process.exit(1);
  }

  if (opts.check) {
    console.log(`Current CACHE_NAME: yes-chef-v${current} (${SW_PATH})`);
    process.exit(0);
  }

  let next;
  if (opts.set != null) {
    if (!Number.isInteger(opts.set) || opts.set < 0) {
      console.error(`error: --set requires a non-negative integer, got '${opts.set}'`);
      process.exit(1);
    }
    next = opts.set;
    if (next <= current) {
      console.warn(`warn: setting version to v${next} which is not greater than current v${current}`);
    }
  } else {
    next = current + 1;
  }

  const nextTag = `yes-chef-v${next}`;
  const nextLine = `const CACHE_NAME = '${nextTag}'`;
  const nextContent = content.replace(CACHE_RE, nextLine);

  if (nextContent === content) {
    console.error('error: replacement produced no change (unexpected)');
    process.exit(1);
  }

  writeFileSync(SW_PATH, nextContent, 'utf8');
  console.log(`Bumped SW cache: yes-chef-v${current} → ${nextTag} (${SW_PATH})`);
}

main();
