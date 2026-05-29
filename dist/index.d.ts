import type { JsonObject } from '@shapeshift-labs/frontier';
import { type FrontierRegistryGraph, type FrontierRegistryImpact, type FrontierRegistryImpactInput, type FrontierRegistryPath, type FrontierRegistryRecord, type FrontierRegistrySource } from '@shapeshift-labs/frontier/registry';
export declare const FRONTIER_MANIFEST_KIND = "frontier.manifest";
export declare const FRONTIER_MANIFEST_VERSION = 1;
export declare const FRONTIER_MANIFEST_QUERY_KIND = "frontier.manifest.query";
export declare const FRONTIER_MANIFEST_QUERY_VERSION = 1;
export declare const FRONTIER_MANIFEST_IMPACT_KIND = "frontier.manifest.impact";
export declare const FRONTIER_MANIFEST_IMPACT_VERSION = 1;
export declare const FRONTIER_MANIFEST_FEATURE_MAP_KIND = "frontier.manifest.feature-map";
export declare const FRONTIER_MANIFEST_FEATURE_MAP_VERSION = 1;
export declare const FRONTIER_MANIFEST_JSONL_KIND = "frontier.manifest.jsonl";
export declare const FRONTIER_MANIFEST_JSONL_VERSION = 1;
export declare const FRONTIER_MANIFEST_PROOF_KIND = "frontier.manifest.proof";
export declare const FRONTIER_MANIFEST_PROOF_VERSION = 1;
export type FrontierManifestEntryKind = 'feature' | 'owner' | 'route' | 'scene' | 'action' | 'state' | 'migration' | 'test' | 'source' | 'asset' | 'task' | 'package' | 'resource' | 'component' | 'effect' | 'trigger' | 'custom' | string;
export type FrontierManifestDiagnosticSeverity = 'error' | 'warning';
export interface FrontierManifestEntryInput {
    id: string;
    kind: FrontierManifestEntryKind;
    name?: string;
    description?: string;
    package?: string;
    feature?: string;
    owner?: string;
    owners?: readonly string[];
    version?: string;
    contentHash?: string;
    source?: FrontierRegistrySource;
    files?: readonly string[];
    assets?: readonly string[];
    routes?: readonly string[];
    actions?: readonly string[];
    states?: readonly FrontierRegistryPath[];
    migrations?: readonly string[];
    tests?: readonly string[];
    resources?: readonly string[];
    reads?: readonly FrontierRegistryPath[];
    writes?: readonly FrontierRegistryPath[];
    calls?: readonly string[];
    dependsOn?: readonly string[];
    invalidates?: readonly string[];
    affects?: readonly string[];
    observes?: readonly string[];
    consumes?: readonly string[];
    produces?: readonly string[];
    emits?: readonly string[];
    covers?: readonly string[];
    tags?: readonly string[];
    metadata?: unknown;
}
export interface FrontierManifestEntry {
    id: string;
    kind: FrontierManifestEntryKind;
    name: string;
    description?: string;
    package?: string;
    feature?: string;
    owner?: string;
    owners: string[];
    version?: string;
    contentHash?: string;
    source?: FrontierRegistrySource;
    files: string[];
    assets: string[];
    routes: string[];
    actions: string[];
    states: string[];
    migrations: string[];
    tests: string[];
    resources: string[];
    reads: string[];
    writes: string[];
    calls: string[];
    dependsOn: string[];
    invalidates: string[];
    affects: string[];
    observes: string[];
    consumes: string[];
    produces: string[];
    emits: string[];
    covers: string[];
    tags: string[];
    metadata?: JsonObject;
}
export interface FrontierManifestOwnerRuleInput {
    id?: string;
    pattern: string;
    owners: readonly string[];
    source?: FrontierRegistrySource;
    tags?: readonly string[];
    metadata?: unknown;
}
export interface FrontierManifestOwnerRule {
    id: string;
    pattern: string;
    owners: string[];
    source?: FrontierRegistrySource;
    tags: string[];
    metadata?: JsonObject;
}
export interface FrontierManifestTaskInput {
    id: string;
    command?: string;
    package?: string;
    feature?: string;
    owner?: string;
    owners?: readonly string[];
    inputs?: readonly string[];
    outputs?: readonly string[];
    dependsOn?: readonly string[];
    cache?: boolean;
    env?: readonly string[];
    tags?: readonly string[];
    metadata?: unknown;
}
export interface FrontierManifestTask {
    id: string;
    command?: string;
    package?: string;
    feature?: string;
    owner?: string;
    owners: string[];
    inputs: string[];
    outputs: string[];
    dependsOn: string[];
    cache?: boolean;
    env: string[];
    tags: string[];
    metadata?: JsonObject;
}
export interface FrontierManifestInput {
    entries?: readonly FrontierManifestEntryInput[];
    tasks?: readonly FrontierManifestTaskInput[];
    ownerRules?: readonly FrontierManifestOwnerRuleInput[];
    codeowners?: string;
    generatedAt?: number;
    root?: string;
    metadata?: unknown;
}
export interface FrontierManifest {
    kind: typeof FRONTIER_MANIFEST_KIND;
    version: typeof FRONTIER_MANIFEST_VERSION;
    generatedAt?: number;
    root?: string;
    entries: FrontierManifestEntry[];
    tasks: FrontierManifestTask[];
    ownerRules: FrontierManifestOwnerRule[];
    diagnostics: FrontierManifestDiagnostic[];
    summary: FrontierManifestSummary;
    metadata?: JsonObject;
}
export interface FrontierManifestDiagnostic {
    severity: FrontierManifestDiagnosticSeverity;
    code: string;
    message: string;
    entryId?: string;
    taskId?: string;
    ownerRuleId?: string;
    file?: string;
}
export interface FrontierManifestSummary {
    entryCount: number;
    taskCount: number;
    ownerRuleCount: number;
    featureCount: number;
    ownerCount: number;
    packageCount: number;
    routeCount: number;
    actionCount: number;
    stateCount: number;
    migrationCount: number;
    testCount: number;
    fileCount: number;
    assetCount: number;
    resourceCount: number;
    tagCount: number;
    errorCount: number;
    warningCount: number;
    kindCounts: Record<string, number>;
}
export interface FrontierManifestQueryInput {
    ids?: readonly string[];
    kinds?: readonly string[];
    features?: readonly string[];
    packages?: readonly string[];
    owners?: readonly string[];
    files?: readonly string[];
    assets?: readonly string[];
    routes?: readonly string[];
    actions?: readonly string[];
    states?: readonly FrontierRegistryPath[];
    migrations?: readonly string[];
    tests?: readonly string[];
    resources?: readonly string[];
    tags?: readonly string[];
    text?: string;
    limit?: number;
}
export interface FrontierManifestQueryResult {
    kind: typeof FRONTIER_MANIFEST_QUERY_KIND;
    version: typeof FRONTIER_MANIFEST_QUERY_VERSION;
    query: FrontierManifestQueryInput;
    summary: FrontierManifestSummary;
    entries: FrontierManifestEntry[];
    tasks: FrontierManifestTask[];
    ownerRules: FrontierManifestOwnerRule[];
}
export interface FrontierManifestImpactInput extends FrontierRegistryImpactInput {
    changedFiles?: readonly string[];
    changedAssets?: readonly string[];
    changedResources?: readonly string[];
    owners?: readonly string[];
    assets?: readonly string[];
    routes?: readonly string[];
    actions?: readonly string[];
    states?: readonly FrontierRegistryPath[];
    migrations?: readonly string[];
    tests?: readonly string[];
    resources?: readonly string[];
    query?: FrontierManifestQueryInput;
}
export type FrontierManifestImpactReasonKind = 'query' | 'id' | 'file' | 'asset' | 'resource' | 'dependency' | 'task-input' | 'owner-rule';
export interface FrontierManifestImpactReason {
    id: string;
    kind: FrontierManifestImpactReasonKind;
    via?: string;
}
export interface FrontierManifestImpact {
    kind: typeof FRONTIER_MANIFEST_IMPACT_KIND;
    version: typeof FRONTIER_MANIFEST_IMPACT_VERSION;
    seeds: string[];
    entryIds: string[];
    taskIds: string[];
    ownerRuleIds: string[];
    owners: string[];
    files: string[];
    assets: string[];
    routes: string[];
    actions: string[];
    states: string[];
    migrations: string[];
    tests: string[];
    resources: string[];
    features: string[];
    packages: string[];
    tags: string[];
    reasons: FrontierManifestImpactReason[];
    registry?: FrontierRegistryImpact;
}
export interface FrontierManifestFeatureNode {
    id: string;
    entryIds: string[];
    taskIds: string[];
    owners: string[];
    files: string[];
    assets: string[];
    routes: string[];
    actions: string[];
    states: string[];
    migrations: string[];
    tests: string[];
    resources: string[];
    packages: string[];
    tags: string[];
    entryCount: number;
    taskCount: number;
}
export interface FrontierManifestFeatureMap {
    kind: typeof FRONTIER_MANIFEST_FEATURE_MAP_KIND;
    version: typeof FRONTIER_MANIFEST_FEATURE_MAP_VERSION;
    generatedAt?: number;
    summary: FrontierManifestSummary;
    features: FrontierManifestFeatureNode[];
    owners: Record<string, string[]>;
    files: Record<string, string[]>;
    assets: Record<string, string[]>;
    routes: Record<string, string[]>;
    actions: Record<string, string[]>;
    states: Record<string, string[]>;
    tests: Record<string, string[]>;
}
export interface FrontierManifestProof {
    kind: typeof FRONTIER_MANIFEST_PROOF_KIND;
    version: typeof FRONTIER_MANIFEST_PROOF_VERSION;
    hash: string;
    entryCount: number;
    taskCount: number;
    ownerRuleCount: number;
    fileCount: number;
    assetCount: number;
    resourceCount: number;
}
export declare function createManifest(input?: FrontierManifestInput): FrontierManifest;
export declare function parseCodeowners(text: string): FrontierManifestOwnerRule[];
export declare function validateManifest(manifest: FrontierManifest): FrontierManifestDiagnostic[];
export declare function queryManifest(manifest: FrontierManifest, input: FrontierManifestQueryInput): FrontierManifestQueryResult;
export declare function manifestImpact(manifest: FrontierManifest, input: FrontierManifestImpactInput): FrontierManifestImpact;
export declare function createManifestFeatureMap(manifest: FrontierManifest): FrontierManifestFeatureMap;
export declare function createManifestRegistryGraph(manifest: FrontierManifest, input?: Omit<FrontierRegistryGraph, 'kind' | 'version' | 'entries' | 'records' | 'edges'>): FrontierRegistryGraph;
export declare function createManifestRecord(entry: FrontierManifestEntry): FrontierRegistryRecord;
export declare function mergeManifests(manifests: readonly FrontierManifest[], input?: Omit<FrontierManifestInput, 'entries' | 'tasks' | 'ownerRules' | 'codeowners'>): FrontierManifest;
export declare function encodeManifestJsonl(manifest: FrontierManifest): string;
export declare function decodeManifestJsonl(text: string): FrontierManifest;
export declare function createManifestProof(manifest: FrontierManifest): FrontierManifestProof;
export declare function normalizeManifestResource(resource: string, fallbackScheme?: string): string;
export declare function matchesManifestPattern(file: string, pattern: string): boolean;
export declare function matchesManifestPatterns(file: string, patterns: readonly string[]): boolean;
//# sourceMappingURL=index.d.ts.map