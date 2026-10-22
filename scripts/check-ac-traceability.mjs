#!/usr/bin/env node
/**
 * Gate: acceptance-criteria traceability.
 *
 * Fails on:
 *   - orphan AC  : a criterion in an active spec (status in-progress|done) that no test cites
 *   - phantom ID : a test citing an AC that no spec defines
 *
 * Limitation, stated plainly: this proves a test *exists* per criterion. It cannot prove the test
 * asserts anything meaningful. Mutation testing is the next gate — see specs/ROADMAP.md.
 */
import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const AC_RE = /\bAC-\d{3}-\d+\b/g;
const ACTIVE = new Set(['in-progress', 'done']);

function walk(dir, exts) {
  if (!existsSync(dir)) return [];
  return readdirSync(dir).flatMap((entry) => {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) return walk(full, exts);
    return exts.some((e) => entry.endsWith(e)) ? [full] : [];
  });
}

function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z_-]+):\s*(.*)$/.exec(line.trim());
    if (kv) fields[kv[1]] = kv[2].trim();
  }
  return fields;
}

const specFiles = walk('specs', ['.md']);
const specs = [];
const definedAcs = new Map(); // AC id -> spec id

for (const file of specFiles) {
  const text = readFileSync(file, 'utf8');
  const fm = parseFrontmatter(text);
  if (!fm?.id) continue; // README.md / ROADMAP.md are prose, not specs
  const body = text.slice(text.indexOf('\n---', 3) + 4);
  // A criterion struck through with ~~AC-xxx-y~~ is withdrawn and stays dead.
  const withdrawn = new Set([...body.matchAll(/~~(AC-\d{3}-\d+)~~/g)].map((m) => m[1]));
  const ids = [...new Set(body.match(AC_RE) ?? [])].filter((id) => !withdrawn.has(id));
  specs.push({ file, id: fm.id, status: fm.status ?? 'planned', acs: ids });
  for (const id of ids) definedAcs.set(id, fm.id);
}

const testFiles = walk('tests', ['.ts', '.tsx']);
const citations = new Map(); // AC id -> [files]
for (const file of testFiles) {
  for (const id of new Set(readFileSync(file, 'utf8').match(AC_RE) ?? [])) {
    citations.set(id, [...(citations.get(id) ?? []), file]);
  }
}

const activeSpecs = specs.filter((s) => ACTIVE.has(s.status));
const orphans = activeSpecs.flatMap((s) =>
  s.acs.filter((id) => !citations.has(id)).map((id) => ({ id, spec: s.id, file: s.file })),
);
const phantoms = [...citations.entries()]
  .filter(([id]) => !definedAcs.has(id))
  .map(([id, files]) => ({ id, files }));

const enforced = activeSpecs.reduce((n, s) => n + s.acs.length, 0);
const planned = specs.filter((s) => !ACTIVE.has(s.status));

console.log(
  `ac-trace: ${specs.length} spec(s), ${activeSpecs.length} active, ` +
    `${enforced} criteria enforced, ${citations.size} cited in ${testFiles.length} test file(s)`,
);
for (const s of specs) {
  const mark = ACTIVE.has(s.status) ? '*' : ' ';
  console.log(`  ${mark} ${s.id} [${s.status}] ${s.acs.length} criteria`);
}
if (planned.length > 0) {
  console.log(
    `  (${planned.length} planned spec(s) not enforced: ${planned.map((s) => s.id).join(', ')})`,
  );
}

let failed = false;
if (orphans.length > 0) {
  failed = true;
  console.error(`\nORPHAN CRITERIA — specified in an active spec, cited by no test:`);
  for (const o of orphans) console.error(`  ${o.id}  (${o.file})`);
  console.error(`\nWrite a test whose title cites the ID, e.g. it('[${orphans[0].id}] ...', ...)`);
}
if (phantoms.length > 0) {
  failed = true;
  console.error(`\nPHANTOM CRITERIA — cited by a test, defined in no spec:`);
  for (const p of phantoms) console.error(`  ${p.id}  (${p.files.join(', ')})`);
  console.error(`\nEither the ID is a typo, or the test is testing something nobody asked for.`);
}

process.exit(failed ? 1 : 0);
