import assert from 'node:assert';
import {
  createManifest,
  createManifestFeatureMap,
  createManifestProof,
  createManifestRegistryGraph,
  decodeManifestJsonl,
  encodeManifestJsonl,
  manifestImpact,
  matchesManifestPattern,
  queryManifest,
  validateManifest
} from '../dist/index.js';

const args = parseArgs(process.argv.slice(2));
const cases = readPositiveInt(args.cases, 300);
let seed = readPositiveInt(args.seed, 0x51a7c);

for (let i = 0; i < cases; i++) {
  const count = randInt(8, 90);
  const entries = [];
  const tasks = [];
  const changedFiles = [];

  for (let j = 0; j < count; j++) {
    const feature = 'feature.' + randInt(0, 9);
    const file = 'src/' + feature.replace('.', '/') + '/entry-' + j + '.ts';
    const route = '/' + feature.replace('.', '/') + '/' + (j % 5);
    changedFiles[changedFiles.length] = file;
    entries[entries.length] = {
      id: 'case' + i + '.entry' + j,
      kind: pick(['feature', 'route', 'action', 'state', 'migration', 'test', 'asset']),
      feature,
      package: '@app/package-' + randInt(0, 4),
      owner: '@team/' + feature,
      source: { file, line: j + 1 },
      files: [file],
      assets: j % 7 === 0 ? ['public/' + feature + '-' + j + '.svg'] : [],
      routes: [route],
      actions: ['action.' + j],
      states: [['features', feature, String(j % 11)]],
      migrations: j % 13 === 0 ? ['migration.' + j] : [],
      tests: ['test.' + j],
      resources: [pick(['fetch', 'storage', 'route', 'asset']) + ':' + feature + '/' + j],
      dependsOn: j === 0 ? [] : ['case' + i + '.entry' + randInt(0, j - 1)],
      tags: ['fuzz', feature]
    };
  }

  for (let j = 0; j < Math.max(2, Math.floor(count / 8)); j++) {
    const feature = 'feature.' + (j % 10);
    tasks[tasks.length] = {
      id: 'case' + i + '.task' + j,
      command: pick(['build', 'test', 'lint']) + ' ' + feature,
      feature,
      package: '@app/package-' + (j % 5),
      owner: '@team/' + feature,
      inputs: ['src/' + feature.replace('.', '/') + '/**'],
      outputs: ['dist/' + feature + '/**'],
      dependsOn: ['case' + i + '.entry' + randInt(0, count - 1)],
      tags: ['task', feature]
    };
  }

  const codeowners = '/src/feature.' + randInt(0, 9) + '/** @team/generated\n/public/** @team/assets\n';
  const manifest = createManifest({ generatedAt: i, codeowners, entries, tasks });
  assert.deepStrictEqual(validateManifest(manifest).filter((diagnostic) => diagnostic.severity === 'error'), []);
  assert.strictEqual(manifest.summary.entryCount, count);

  const sample = entries[randInt(0, entries.length - 1)];
  const byFeature = queryManifest(manifest, { features: [sample.feature] });
  assert.ok(byFeature.entries.some((entry) => entry.feature === sample.feature));
  const byFile = queryManifest(manifest, { files: [sample.files[0]] });
  assert.ok(byFile.entries.some((entry) => entry.id === sample.id));
  const impact = manifestImpact(manifest, { changedFiles: [sample.files[0]] });
  assert.ok(impact.entryIds.includes(sample.id), 'impact missed ' + sample.id);
  const emptyImpact = manifestImpact(manifest, {});
  assert.deepStrictEqual(emptyImpact.entryIds, []);
  assert.deepStrictEqual(emptyImpact.taskIds, []);
  const unmatchedImpact = manifestImpact(manifest, { changedFiles: ['unmatched/case-' + i + '.ts'] });
  assert.deepStrictEqual(unmatchedImpact.entryIds, []);
  assert.deepStrictEqual(unmatchedImpact.taskIds, []);

  const featureMap = createManifestFeatureMap(manifest);
  assert.strictEqual(featureMap.summary.entryCount, manifest.summary.entryCount);
  assert.ok(featureMap.features.length >= 1);
  assert.ok(createManifestRegistryGraph(manifest).entries.length >= manifest.entries.length);
  assert.strictEqual(matchesManifestPattern(sample.files[0], 'src/**'), true);

  const jsonl = encodeManifestJsonl(manifest);
  const decoded = decodeManifestJsonl(jsonl);
  assert.strictEqual(decoded.summary.entryCount, manifest.summary.entryCount);
  assert.strictEqual(createManifestProof(decoded).hash, createManifestProof(decodeManifestJsonl(encodeManifestJsonl(decoded))).hash);
}

console.log(`frontier manifest fuzz passed: cases=${cases}`);

function rand() {
  seed = (seed * 1664525 + 1013904223) >>> 0;
  return seed / 0x100000000;
}

function randInt(min, max) {
  return min + Math.floor(rand() * (max - min + 1));
}

function pick(values) {
  return values[randInt(0, values.length - 1)];
}

function parseArgs(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--cases') out.cases = argv[++i];
    else if (arg === '--seed') out.seed = argv[++i];
  }
  return out;
}

function readPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}
