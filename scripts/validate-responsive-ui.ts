import { strict as assert } from 'node:assert';
import fs from 'node:fs';

const sidebar = fs.readFileSync('apps/web/components/sidebar.tsx', 'utf8');
const layout = fs.readFileSync('apps/web/app/layout.tsx', 'utf8');

assert.ok(sidebar.includes('md:hidden') && sidebar.includes('fixed inset-0'), 'mobile drawer not found');
assert.ok(layout.includes('overflow-x-hidden'), 'global overflow-x-hidden missing');
assert.ok(sidebar.includes('overflow-y-auto'), 'drawer overflow handling missing');
console.log('validate:responsive-ui PASS');
