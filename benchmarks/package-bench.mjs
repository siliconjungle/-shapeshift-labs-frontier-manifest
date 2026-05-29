import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import {
  createManifest,
  createManifestFeatureMap,
  createManifestProof,
  createManifestRegistryGraph,
  decodeManifestJsonl,
  encodeManifestJsonl,
  manifestImpact,
  mergeManifests,
  queryManifest
} from '../dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const packageDir = path.resolve(__dirname, '..');
const repoRoot = path.basename(path.dirname(packageDir)) === 'packages'
  ? path.resolve(packageDir, '..', '..')
  : packageDir;
const args = parseArgs(process.argv.slice(2));
const entryCount = readPositiveInt(args.entries, 1000);
const rounds = readPositiveInt(args.rounds, 20);
const outPath = args.out ? path.resolve(repoRoot, args.out) : null;

const input = makeManifestInput(entryCount);
let manifest = createManifest(input);
let jsonl = encodeManifestJsonl(manifest);
const files = manifest.entries.flatMap((entry) => entry.files);
const resources = manifest.entries.flatMap((entry) => entry.resources);
const features = [...new Set(manifest.entries.map((entry) => entry.feature).filter(Boolean))];
const owners = [...new Set(manifest.entries.flatMap((entry) => entry.owners))];
let cursor = 0;

const rows = [
  measure('create-manifest-' + entryCount, 1, () => {
    manifest = createManifest(input);
    return manifest.entries.length + manifest.tasks.length + manifest.ownerRules.length;
  }),
  measure('query-file-' + entryCount, 64, () => {
    const file = files[cursor++ % files.length];
    return queryManifest(manifest, { files: [file] }).entries.length;
  }),
  measure('query-feature-' + entryCount, 64, () => {
    const feature = features[cursor++ % features.length];
    return queryManifest(manifest, { features: [feature] }).entries.length;
  }),
  measure('query-owner-' + entryCount, 64, () => {
    const owner = owners[cursor++ % owners.length];
    return queryManifest(manifest, { owners: [owner] }).entries.length;
  }),
  measure('impact-file-' + entryCount, 16, () => {
    const file = files[cursor++ % files.length];
    return manifestImpact(manifest, { changedFiles: [file] }).entryIds.length;
  }),
  measure('impact-resource-' + entryCount, 16, () => {
    const resource = resources[cursor++ % resources.length];
    return manifestImpact(manifest, { changedResources: [resource] }).entryIds.length;
  }),
  measure('feature-map-' + entryCount, 1, () => createManifestFeatureMap(manifest).features.length),
  measure('registry-graph-' + entryCount, 1, () => {
    const graph = createManifestRegistryGraph(manifest);
    return graph.entries.length + graph.records.length + graph.edges.length;
  }),
  measure('jsonl-encode-' + entryCount, 1, () => {
    jsonl = encodeManifestJsonl(manifest);
    return jsonl.length;
  }),
  measure('jsonl-decode-' + entryCount, 1, () => decodeManifestJsonl(jsonl).entries.length),
  measure('proof-' + entryCount, 1, () => createManifestProof(manifest).hash.length),
  measure('merge-two-' + entryCount, 1, () => mergeManifests([manifest, manifest]).summary.entryCount)
];

const report = {
  package: '@shapeshift-labs/frontier-manifest',
  version: readPackageVersion(),
  generatedAt: new Date().toISOString(),
  node: process.version,
  platform: process.platform + ' ' + process.arch,
  entryCount,
  taskCount: manifest.tasks.length,
  rounds,
  rows
};

if (outPath) {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(report, null, 2) + '\n');
}

console.log(report.package + ' package benchmark');
console.log('Node ' + report.node + ' on ' + report.platform + ', entries=' + entryCount + ', rounds=' + rounds);
console.log('These are Frontier-only package measurements, not competitor comparisons.');
console.log('');
console.log(padRight('Fixture', 30) + padLeft('Median', 12) + padLeft('p95', 12));
for (const row of rows) {
  console.log(padRight(row.fixture, 30) + padLeft(formatUs(row.medianUs), 12) + padLeft(formatUs(row.p95Us), 12));
}
if (outPath) console.log('\nwrote ' + path.relative(repoRoot, outPath));

function makeManifestInput(count) {
  const entries = [];
  const tasks = [];
  const codeowners = [];
  for (let featureIndex = 0; featureIndex < 32; featureIndex++) {
    codeowners[codeowners.length] = '/src/feature-' + featureIndex + '/** @team/feature-' + featureIndex;
  }
  codeowners[codeowners.length] = '/public/** @team/assets';
  for (let i = 0; i < count; i++) {
    const feature = 'feature-' + (i % 32);
    const base = 'src/' + feature + '/module-' + (i % 17);
    entries[entries.length] = {
      id: 'entry.' + i,
      kind: pickKind(i),
      name: 'Entry ' + i,
      feature,
      package: '@app/package-' + (i % 8),
      source: { file: base + '/index.ts', line: i + 1, symbol: 'entry' + i },
      files: [base + '/index.ts', base + '/view.ts'],
      assets: i % 5 === 0 ? ['public/' + feature + '/asset-' + i + '.svg'] : [],
      routes: ['/app/' + feature + '/' + (i % 11)],
      actions: ['action.' + feature + '.' + (i % 13)],
      states: [['features', feature, String(i % 19)]],
      migrations: i % 29 === 0 ? ['migration.' + feature + '.' + i] : [],
      tests: ['test.' + feature + '.' + (i % 23)],
      resources: [pickResource(i, feature)],
      reads: [['state', feature, 'read', String(i % 7)]],
      writes: [['state', feature, 'write', String(i % 7)]],
      dependsOn: i === 0 ? [] : ['entry.' + Math.floor((i - 1) / 2)],
      tags: ['bench', feature]
    };
  }
  for (let i = 0; i < Math.max(4, Math.floor(count / 20)); i++) {
    const feature = 'feature-' + (i % 32);
    tasks[tasks.length] = {
      id: 'task.' + i,
      command: pickCommand(i) + ' ' + feature,
      feature,
      package: '@app/package-' + (i % 8),
      inputs: ['src/' + feature + '/**', '!src/' + feature + '/**/__generated__/**'],
      outputs: ['dist/' + feature + '/**'],
      dependsOn: ['entry.' + (i % count)],
      env: ['NODE_ENV'],
      tags: ['bench', 'task']
    };
  }
  return { generatedAt: 1, codeowners: codeowners.join('\n') + '\n', entries, tasks };
}

function pickKind(index) {
  return ['feature', 'route', 'action', 'state', 'migration', 'test', 'asset', 'component', 'effect'][index % 9];
}

function pickResource(index, feature) {
  const group = index % 6;
  if (group === 0) return 'fetch:/api/' + feature + '/' + index;
  if (group === 1) return 'storage:indexeddb/' + feature + '/' + index;
  if (group === 2) return 'route:/app/' + feature + '/' + index;
  if (group === 3) return 'worker:' + feature + '-' + index;
  if (group === 4) return 'asset:/public/' + feature + '/' + index + '.svg';
  return 'scene:' + feature + '/' + index;
}

function pickCommand(index) {
  return ['build', 'test', 'lint', 'typecheck'][index % 4];
}

function measure(fixture, batchSize, fn, innerOps = 1) {
  const values = [];
  let sink = 0;
  for (let round = 0; round < rounds; round++) {
    const started = performance.now();
    for (let i = 0; i < batchSize; i++) sink += fn();
    values[values.length] = ((performance.now() - started) * 1000) / (batchSize * innerOps);
  }
  if (sink === -1) console.log('sink=' + sink);
  values.sort((left, right) => left - right);
  return {
    fixture,
    medianUs: percentile(values, 0.5),
    p95Us: percentile(values, 0.95)
  };
}

function percentile(values, p) {
  return values[Math.min(values.length - 1, Math.floor((values.length - 1) * p))] ?? 0;
}

function formatUs(value) {
  if (value >= 1000) return (value / 1000).toFixed(2) + ' ms';
  return value.toFixed(2) + ' us';
}

function padRight(value, width) {
  return String(value).padEnd(width, ' ');
}

function padLeft(value, width) {
  return String(value).padStart(width, ' ');
}

function readPackageVersion() {
  return JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).version;
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--entries') out.entries = argv[++i];
    else if (arg === '--rounds') out.rounds = argv[++i];
    else if (arg === '--out') out.out = argv[++i];
    else if (arg === '--help' || arg === '-h') {
      console.log('Usage: npm run bench -- [--entries 1000] [--rounds 20] [--out benchmarks/results/frontier-manifest-package-bench-latest.json]');
      process.exit(0);
    }
  }
  return out;
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
