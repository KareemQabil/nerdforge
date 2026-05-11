#!/usr/bin/env bash
# examples/run-demo.sh — bootstraps a tiny TS project and walks the full nerdforge workflow.
# Requires: DIGITALOCEAN_TOKEN exported, nerdforge built (yarn build) and on PATH (yarn link).
set -euo pipefail

DEMO=${DEMO:-/tmp/nerdforge-demo}
rm -rf "$DEMO" && mkdir -p "$DEMO" && cd "$DEMO"

git init -q
git config user.email demo@nerdforge.local
git config user.name "nerdforge demo"

cat > package.json <<'JSON'
{ "name": "demo", "version": "0.1.0", "type": "module" }
JSON

mkdir -p src test
cat > src/discount.ts <<'TS'
export function discount(_total: number, _storeId: string): number {
  return 0; // intentionally wrong; the worker will fix this
}
TS

cat > test/discount.test.ts <<'TS'
import { describe, it, expect } from 'vitest';
import { discount } from '../src/discount.js';

describe('discount', () => {
  it('applies a 10% discount for store-a', () => {
    expect(discount(100, 'store-a')).toBe(10);
  });
});
TS

echo ".nerdforge/" > .gitignore
git add -A && git commit -q -m "init"

nerdforge init
nerdforge doctor
nerdforge repomap
nerdforge blueprint --goal "Add a configurable discount rule: store-a gets 10% off."
nerdforge audit:symbols
nerdforge microtasks
nerdforge work MT-001
nerdforge status
