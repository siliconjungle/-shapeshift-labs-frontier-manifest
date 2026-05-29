import {
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
  type FrontierManifest,
  type FrontierManifestEntry,
  type FrontierManifestFeatureMap,
  type FrontierManifestImpact,
  type FrontierManifestOwnerRule,
  type FrontierManifestProof,
  type FrontierManifestQueryResult,
  type FrontierManifestTask
} from '@shapeshift-labs/frontier-manifest';

const owners: FrontierManifestOwnerRule[] = parseCodeowners('/src/** @team/app');
const manifest: FrontierManifest = createManifest({
  codeowners: '/src/** @team/app',
  entries: [{ id: 'types.feature', kind: 'feature', feature: 'types', files: ['src/types.ts'] }],
  tasks: [{ id: 'types.build', inputs: ['src/**'], outputs: ['dist/**'] }]
});
const entry: FrontierManifestEntry = manifest.entries[0];
const task: FrontierManifestTask = manifest.tasks[0];
const query: FrontierManifestQueryResult = queryManifest(manifest, { files: ['src/types.ts'] });
const impact: FrontierManifestImpact = manifestImpact(manifest, { changedFiles: ['src/types.ts'] });
const featureMap: FrontierManifestFeatureMap = createManifestFeatureMap(manifest);
const graph = createManifestRegistryGraph(manifest);
const jsonl: string = encodeManifestJsonl(manifest);
const decoded: FrontierManifest = decodeManifestJsonl(jsonl);
const merged: FrontierManifest = mergeManifests([decoded]);
const proof: FrontierManifestProof = createManifestProof(merged);
const resource: string = normalizeManifestResource('src/types.ts');
const matched: boolean = matchesManifestPattern('src/types.ts', '/src/**');
const patternsMatched: boolean = matchesManifestPatterns('src/types.ts', ['src/**', '!src/generated/**']);

void owners;
void entry;
void task;
void query;
void impact;
void featureMap;
void graph;
void proof;
void resource;
void matched;
void patternsMatched;
