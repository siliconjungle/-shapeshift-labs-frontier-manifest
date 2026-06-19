import assert from 'node:assert';
import {
  FRONTIER_MANIFEST_AUTONOMOUS_CAPACITY_KIND,
  createAutonomousCapacityManifest,
  createManifest,
  createManifestFeatureMap,
  createManifestProof,
  createManifestRegistryGraph,
  decodeManifestJsonl,
  encodeManifestJsonl,
  manifestImpact,
  matchesManifestPattern,
  matchesManifestPatterns,
  mergeManifests,
  normalizeManifestResource,
  parseCodeowners,
  queryManifest,
  validateManifest
} from '../dist/index.js';

const codeowners = `
# app ownership
/src/todos/** @app/todos
/tests/todos/** @qa/todos
/public/** @app/assets
`;

const ownerRules = parseCodeowners(codeowners);
assert.strictEqual(ownerRules.length, 3);
assert.strictEqual(matchesManifestPattern('src/todos/load.ts', '/src/todos/**'), true);
assert.strictEqual(matchesManifestPattern('src/settings/load.ts', '/src/todos/**'), false);
assert.strictEqual(matchesManifestPatterns('src/todos/load.ts', ['src/**', '!src/**/__generated__/**']), true);
assert.strictEqual(matchesManifestPatterns('src/todos/__generated__/load.ts', ['src/**', '!src/**/__generated__/**']), false);
assert.strictEqual(normalizeManifestResource('/api/todos'), 'manifest:/api/todos');

const manifest = createManifest({
  generatedAt: 123,
  root: 'apps/todos',
  codeowners,
  metadata: { suite: 'smoke' },
  entries: [
    {
      id: 'feature.todos',
      kind: 'feature',
      name: 'Todos',
      feature: 'todos',
      package: '@app/todos',
      source: { file: 'src/todos/index.ts', line: 1 },
      files: ['src/todos/model.ts'],
      routes: ['/todos'],
      actions: ['todos.load', 'todos.toggle'],
      states: ['entities.todos'],
      resources: ['route:/todos'],
      tags: ['product']
    },
    {
      id: 'action.todos.load',
      kind: 'action',
      name: 'Load todos',
      feature: 'todos',
      package: '@app/todos',
      source: { file: 'src/todos/load.ts', line: 12, symbol: 'loadTodos' },
      files: ['src/todos/load.ts'],
      routes: ['/todos'],
      actions: ['todos.load'],
      states: ['entities.todos'],
      resources: ['fetch:/api/todos'],
      writes: ['entities.todos'],
      dependsOn: ['feature.todos'],
      tests: ['test.todos.load'],
      tags: ['network']
    },
    {
      id: 'test.todos.load',
      kind: 'test',
      feature: 'todos',
      package: '@app/todos',
      source: { file: 'tests/todos/load.test.ts', line: 4 },
      files: ['tests/todos/load.test.ts'],
      tests: ['test.todos.load'],
      dependsOn: ['action.todos.load'],
      tags: ['test']
    },
    {
      id: 'asset.todos.icon',
      kind: 'asset',
      feature: 'todos',
      package: '@app/todos',
      source: { file: 'public/todos.svg' },
      assets: ['public/todos.svg'],
      resources: ['asset:/public/todos.svg'],
      tags: ['asset']
    },
    {
      id: 'migration.todos.v2',
      kind: 'migration',
      feature: 'todos',
      package: '@app/todos',
      source: { file: 'src/todos/migrations/v2.ts' },
      migrations: ['todos.v2'],
      states: ['entities.todos'],
      dependsOn: ['feature.todos'],
      tags: ['migration']
    }
  ],
  tasks: [
    {
      id: 'task.todos.build',
      command: 'vite build',
      feature: 'todos',
      package: '@app/todos',
      inputs: ['src/todos/**', 'public/**'],
      outputs: ['dist/todos/**'],
      dependsOn: ['action.todos.load'],
      env: ['NODE_ENV'],
      tags: ['build']
    },
    {
      id: 'task.todos.test',
      command: 'vitest run',
      feature: 'todos',
      package: '@app/todos',
      inputs: ['src/todos/**', 'tests/todos/**'],
      outputs: ['coverage/todos/**'],
      dependsOn: ['task.todos.build'],
      tags: ['test']
    }
  ]
});

assert.deepStrictEqual(validateManifest(manifest).filter((diagnostic) => diagnostic.severity === 'error'), []);
assert.strictEqual(manifest.summary.entryCount, 5);
assert.strictEqual(manifest.summary.taskCount, 2);
assert.ok(manifest.summary.ownerCount >= 3);
assert.strictEqual(manifest.entries.find((entry) => entry.id === 'action.todos.load')?.owner, '@app/todos');
assert.strictEqual(manifest.tasks.find((task) => task.id === 'task.todos.build')?.owner, '@app/assets');

assert.deepStrictEqual(queryManifest(manifest, { owners: ['@app/todos'] }).entries.map((entry) => entry.id), [
  'feature.todos',
  'action.todos.load',
  'migration.todos.v2'
]);
assert.deepStrictEqual(queryManifest(manifest, { resources: ['fetch:/api/todos'] }).entries.map((entry) => entry.id), [
  'action.todos.load'
]);
assert.deepStrictEqual(queryManifest(manifest, { files: ['src/todos/load.ts'] }).entries.map((entry) => entry.id), [
  'action.todos.load'
]);
assert.deepStrictEqual(queryManifest(manifest, { files: ['src/todos/load.ts'] }).tasks.map((task) => task.id), [
  'task.todos.build',
  'task.todos.test'
]);

const impact = manifestImpact(manifest, { changedFiles: ['src/todos/load.ts'] });
assert.ok(impact.entryIds.includes('action.todos.load'));
assert.ok(impact.entryIds.includes('test.todos.load'));
assert.ok(impact.taskIds.includes('task.todos.build'));
assert.ok(impact.taskIds.includes('task.todos.test'));
assert.ok(impact.owners.includes('@app/todos'));
assert.ok(impact.tests.includes('test.todos.load'));

const featureMap = createManifestFeatureMap(manifest);
const todosFeature = featureMap.features.find((feature) => feature.id === 'todos');
assert.ok(todosFeature?.entryIds.includes('action.todos.load'));
assert.ok(todosFeature?.taskIds.includes('task.todos.build'));
assert.ok(featureMap.files['src/todos/load.ts'].includes('action.todos.load'));

const graph = createManifestRegistryGraph(manifest);
assert.ok(graph.entries.some((entry) => entry.id === 'action.todos.load' && entry.kind === 'action'));
assert.ok(graph.edges.some((edge) => edge.kind === 'owned-by' && edge.to === 'owner:@app/todos'));
assert.ok(manifestImpact(manifest, { ids: ['action.todos.load'], direction: 'forward' }).registry?.nodes.includes('entry:action.todos.load'));

const jsonl = encodeManifestJsonl(manifest);
const decoded = decodeManifestJsonl(jsonl);
assert.strictEqual(decoded.summary.entryCount, manifest.summary.entryCount);
assert.strictEqual(createManifestProof(decoded).hash, createManifestProof(decodeManifestJsonl(encodeManifestJsonl(decoded))).hash);

const merged = mergeManifests([manifest, createManifest({ entries: [{ id: 'feature.settings', kind: 'feature', feature: 'settings' }] })]);
assert.strictEqual(merged.summary.featureCount, 2);

const duplicate = createManifest({
  entries: [
    { id: 'dupe', kind: 'feature' },
    { id: 'dupe', kind: 'action' }
  ]
});
assert.ok(duplicate.diagnostics.some((diagnostic) => diagnostic.code === 'duplicate-id'));

const overlappingOwners = createManifest({
  codeowners: `
/src/** @team/app
/src/todos/** @team/todos
`,
  entries: [{ id: 'owner.last-match', kind: 'source', files: ['src/todos/load.ts'] }]
});
assert.deepStrictEqual(overlappingOwners.entries[0].owners, ['@team/todos']);

const focusedManifest = createManifest({
  entries: [
    {
      id: 'action.focused',
      kind: 'action',
      feature: 'focused',
      files: ['src/focused/action.ts'],
      resources: ['fetch:/api/focused']
    },
    {
      id: 'test.focused',
      kind: 'test',
      feature: 'focused',
      files: ['tests/focused/action.test.ts'],
      dependsOn: ['action.focused'],
      tests: ['test.focused']
    },
    {
      id: 'action.unrelated',
      kind: 'action',
      feature: 'unrelated',
      files: ['src/unrelated/action.ts'],
      resources: ['fetch:/api/unrelated']
    }
  ],
  tasks: [
    {
      id: 'task.focused.test',
      feature: 'focused',
      inputs: ['src/focused/**', 'tests/focused/**'],
      dependsOn: ['test.focused']
    },
    {
      id: 'task.unrelated.test',
      feature: 'unrelated',
      inputs: ['src/unrelated/**']
    }
  ]
});
const focusedFileImpact = manifestImpact(focusedManifest, { changedFiles: ['src/focused/action.ts'] });
assert.deepStrictEqual(focusedFileImpact.entryIds, ['action.focused', 'test.focused']);
assert.deepStrictEqual(focusedFileImpact.taskIds, ['task.focused.test']);
assert.ok(!focusedFileImpact.entryIds.includes('action.unrelated'));
assert.ok(!focusedFileImpact.taskIds.includes('task.unrelated.test'));
assert.ok(focusedFileImpact.reasons.some((reason) => reason.id === 'action.focused' && reason.kind === 'file'));

const focusedResourceImpact = manifestImpact(focusedManifest, { changedResources: ['fetch:/api/focused'] });
assert.deepStrictEqual(focusedResourceImpact.entryIds, ['action.focused', 'test.focused']);
assert.deepStrictEqual(focusedResourceImpact.taskIds, ['task.focused.test']);

const emptyImpact = manifestImpact(focusedManifest, {});
assert.deepStrictEqual(emptyImpact.entryIds, []);
assert.deepStrictEqual(emptyImpact.taskIds, []);

const autonomousCapacity = createAutonomousCapacityManifest({
  generatedAt: 456,
  metadata: { scope: 'generic-autonomous-control-plane' },
  lanes: [
    {
      id: 'autonomous-merge',
      name: 'Autonomous merge',
      description: 'Lease-backed agent lane for applying reviewed merge bundles.',
      maxConcurrency: 4,
      activeLeases: [
        {
          id: 'lease.agent-a',
          holder: 'agent-a',
          taskId: 'merge.bundle-a',
          acquiredAt: 100,
          expiresAt: 200
        },
        {
          id: 'lease.agent-b',
          holder: 'agent-b',
          taskId: 'merge.bundle-b',
          status: 'renewing'
        }
      ],
      queueSource: {
        id: 'merge-queue',
        kind: 'jsonl',
        uri: 'queue://autonomous-merge',
        pollIntervalMs: 5000
      },
      modelProfile: {
        id: 'deep-agent',
        provider: 'portable-ai-provider',
        model: 'large-reasoning',
        compute: 'deep',
        runtime: 'codex-like',
        contextTokens: 200000,
        maxOutputTokens: 16000,
        metadata: {
          pricing: {
            currency: 'USD',
            unitTokens: 1000000,
            inputUsdPerUnit: 5,
            outputUsdPerUnit: 30
          }
        }
      },
      drainPolicy: {
        mode: 'continuous',
        allowNewLeases: true,
        stopWhenQueueEmpty: false,
        routineReview: 'non-blocking',
        humanBlockers: ['explicit-human-question']
      },
      tags: ['agent', 'swarm', 'autonomous-merge']
    }
  ]
});
assert.strictEqual(autonomousCapacity.kind, FRONTIER_MANIFEST_AUTONOMOUS_CAPACITY_KIND);
assert.strictEqual(autonomousCapacity.totalMaxConcurrency, 4);
assert.strictEqual(autonomousCapacity.totalActiveLeases, 2);
assert.strictEqual(autonomousCapacity.totalAvailableConcurrency, 2);
assert.strictEqual(autonomousCapacity.lanes[0].queueSource.kind, 'jsonl');
assert.strictEqual(autonomousCapacity.lanes[0].modelProfile.model, 'large-reasoning');
assert.strictEqual(autonomousCapacity.lanes[0].drainPolicy.routineReview, 'non-blocking');
assert.deepStrictEqual(autonomousCapacity.lanes[0].drainPolicy.humanBlockers, ['explicit-human-question']);

const autonomousMergeManifest = createManifest({
  metadata: { autonomousCapacity },
  entries: [
    {
      id: 'capacity.autonomous-merge',
      kind: 'capacity',
      name: 'Autonomous merge capacity',
      feature: 'autonomous-merge',
      resources: ['queue:autonomous-merge'],
      tags: ['agent', 'swarm', 'autonomous-merge'],
      metadata: {
        autonomousCapacityLane: autonomousCapacity.lanes[0]
      }
    }
  ],
  tasks: [
    {
      id: 'task.autonomous-merge.drain',
      feature: 'autonomous-merge',
      inputs: ['queues/autonomous-merge/**'],
      tags: ['agent', 'autonomous-merge'],
      metadata: {
        drainPolicy: autonomousCapacity.lanes[0].drainPolicy
      }
    }
  ]
});
assert.deepStrictEqual(validateManifest(autonomousMergeManifest).filter((diagnostic) => diagnostic.severity === 'error'), []);
assert.strictEqual(autonomousMergeManifest.summary.kindCounts.capacity, 1);
assert.strictEqual(autonomousMergeManifest.summary.resourceCount, 1);
assert.deepStrictEqual(queryManifest(autonomousMergeManifest, { tags: ['autonomous-merge'] }).entries.map((entry) => entry.id), [
  'capacity.autonomous-merge'
]);
assert.deepStrictEqual(manifestImpact(autonomousMergeManifest, { changedFiles: ['queues/autonomous-merge/bundle.json'] }).taskIds, [
  'task.autonomous-merge.drain'
]);

console.log('frontier manifest smoke passed');
