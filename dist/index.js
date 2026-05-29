import { createFrontierRegistryGraph, frontierRegistryImpact, normalizeFrontierRegistryPath } from '@shapeshift-labs/frontier/registry';
export const FRONTIER_MANIFEST_KIND = 'frontier.manifest';
export const FRONTIER_MANIFEST_VERSION = 1;
export const FRONTIER_MANIFEST_QUERY_KIND = 'frontier.manifest.query';
export const FRONTIER_MANIFEST_QUERY_VERSION = 1;
export const FRONTIER_MANIFEST_IMPACT_KIND = 'frontier.manifest.impact';
export const FRONTIER_MANIFEST_IMPACT_VERSION = 1;
export const FRONTIER_MANIFEST_FEATURE_MAP_KIND = 'frontier.manifest.feature-map';
export const FRONTIER_MANIFEST_FEATURE_MAP_VERSION = 1;
export const FRONTIER_MANIFEST_JSONL_KIND = 'frontier.manifest.jsonl';
export const FRONTIER_MANIFEST_JSONL_VERSION = 1;
export const FRONTIER_MANIFEST_PROOF_KIND = 'frontier.manifest.proof';
export const FRONTIER_MANIFEST_PROOF_VERSION = 1;
const MANIFEST_INDEX = new WeakMap();
const GLOB_REGEX_CACHE = new Map();
export function createManifest(input = {}) {
    const parsedOwnerRules = input.codeowners === undefined ? [] : parseCodeowners(input.codeowners);
    const ownerRules = [...parsedOwnerRules, ...(input.ownerRules ?? []).map(normalizeOwnerRule)];
    const entries = (input.entries ?? []).map(normalizeEntry);
    const tasks = (input.tasks ?? []).map(normalizeTask);
    applyOwnerRules(entries, tasks, ownerRules);
    const diagnostics = validateManifestParts(entries, tasks, ownerRules);
    const summary = summarizeManifestParts(entries, tasks, ownerRules, diagnostics);
    return {
        kind: FRONTIER_MANIFEST_KIND,
        version: FRONTIER_MANIFEST_VERSION,
        generatedAt: input.generatedAt,
        root: normalizeOptionalString(input.root),
        entries,
        tasks,
        ownerRules,
        diagnostics,
        summary,
        metadata: cloneJsonObject(input.metadata)
    };
}
export function parseCodeowners(text) {
    const rules = [];
    const lines = String(text).split(/\r?\n/);
    for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
        const raw = lines[lineIndex].trim();
        if (raw.length === 0 || raw.startsWith('#'))
            continue;
        const columns = raw.split(/\s+/);
        const pattern = columns[0];
        const owners = [];
        for (let i = 1; i < columns.length; i++) {
            if (columns[i].startsWith('#'))
                break;
            owners[owners.length] = columns[i];
        }
        if (pattern.length === 0 || owners.length === 0)
            continue;
        rules[rules.length] = normalizeOwnerRule({
            id: 'codeowners:' + (lineIndex + 1) + ':' + hashHex32(raw).slice(0, 8),
            pattern,
            owners,
            metadata: { line: lineIndex + 1 }
        });
    }
    return rules;
}
export function validateManifest(manifest) {
    return validateManifestParts(manifest.entries, manifest.tasks, manifest.ownerRules);
}
export function queryManifest(manifest, input) {
    const index = getManifestIndex(manifest);
    let entryIds = null;
    let taskIds = null;
    entryIds = intersectCandidate(entryIds, input.ids?.filter((id) => index.entriesById.has(id)));
    taskIds = intersectCandidate(taskIds, input.ids?.filter((id) => index.tasksById.has(id)));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByKind, input.kinds?.map(String).filter((kind) => kind !== 'task')));
    if (input.kinds !== undefined && input.kinds.some((kind) => kind === 'task' || kind === 'job')) {
        taskIds = intersectCandidate(taskIds, index.taskIds);
    }
    else if (input.kinds !== undefined) {
        taskIds = intersectCandidate(taskIds, []);
    }
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByFeature, input.features?.map(String)));
    taskIds = intersectCandidate(taskIds, idsFromMap(index.taskIdsByFeature, input.features?.map(String)));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByPackage, input.packages?.map(String)));
    taskIds = intersectCandidate(taskIds, idsFromMap(index.taskIdsByPackage, input.packages?.map(String)));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByOwner, input.owners?.map(String)));
    taskIds = intersectCandidate(taskIds, idsFromMap(index.taskIdsByOwner, input.owners?.map(String)));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByFile, input.files?.map(normalizeFilePath)));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByAsset, input.assets?.map(normalizeFilePath)));
    taskIds = intersectCandidate(taskIds, taskIdsForFiles(index, manifest.tasks, input.files?.map(normalizeFilePath), 'input'));
    taskIds = intersectCandidate(taskIds, taskIdsForFiles(index, manifest.tasks, input.assets?.map(normalizeFilePath), 'output'));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByRoute, input.routes?.map(normalizeRoute)));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByAction, input.actions?.map(String)));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByState, input.states?.map(normalizeFrontierRegistryPath)));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByMigration, input.migrations?.map(String)));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByTest, input.tests?.map(String)));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByResource, input.resources?.map((resource) => normalizeManifestResource(resource))));
    entryIds = intersectCandidate(entryIds, idsFromMap(index.entryIdsByTag, input.tags?.map(String)));
    taskIds = intersectCandidate(taskIds, idsFromMap(index.taskIdsByTag, input.tags?.map(String)));
    const text = input.text === undefined ? undefined : String(input.text).toLowerCase();
    const selectedEntryIds = entryIds ?? index.entryIds;
    const selectedTaskIds = taskIds ?? index.taskIds;
    const entries = selectedEntryIds
        .map((id) => index.entriesById.get(id))
        .filter((entry) => entry !== undefined && (text === undefined || entryMatchesText(entry, text)));
    const tasks = selectedTaskIds
        .map((id) => index.tasksById.get(id))
        .filter((task) => task !== undefined && (text === undefined || taskMatchesText(task, text)));
    const limit = input.limit === undefined ? undefined : Math.max(0, Math.floor(input.limit));
    const limitedEntries = limit === undefined ? entries : entries.slice(0, limit);
    const limitedTasks = limit === undefined ? tasks : tasks.slice(0, Math.max(0, limit - limitedEntries.length));
    const owners = new Set();
    for (const entry of limitedEntries)
        collectSet(owners, entry.owners);
    for (const task of limitedTasks)
        collectSet(owners, task.owners);
    const ownerRules = manifest.ownerRules.filter((rule) => hasAnyArray(rule.owners, owners));
    const diagnostics = validateManifestParts(limitedEntries, limitedTasks, ownerRules);
    return {
        kind: FRONTIER_MANIFEST_QUERY_KIND,
        version: FRONTIER_MANIFEST_QUERY_VERSION,
        query: cloneQuery(input),
        summary: summarizeManifestParts(limitedEntries, limitedTasks, ownerRules, diagnostics),
        entries: limitedEntries.map(cloneEntry),
        tasks: limitedTasks.map(cloneTask),
        ownerRules: ownerRules.map(cloneOwnerRule)
    };
}
export function manifestImpact(manifest, input) {
    const index = getManifestIndex(manifest);
    const hasRegistryTraversal = input.direction !== undefined || input.nodes !== undefined || input.ids !== undefined || input.paths !== undefined;
    const query = input.query ?? createImpactQueryInput(input);
    const result = query === undefined ? undefined : queryManifest(manifest, query);
    const selected = new Set();
    const reasons = [];
    for (const entry of result?.entries ?? [])
        markAffected(selected, reasons, entry.id, 'query');
    for (const task of result?.tasks ?? [])
        markAffected(selected, reasons, task.id, 'query');
    for (const id of input.ids ?? [])
        markAffected(selected, reasons, String(id), 'id');
    for (const file of input.changedFiles ?? []) {
        const normalized = normalizeFilePath(file);
        for (const entry of manifest.entries) {
            if (entryMatchesChangedFile(entry, normalized))
                markAffected(selected, reasons, entry.id, 'file', normalized);
        }
        for (const task of manifest.tasks) {
            if (taskMatchesChangedFile(task, normalized))
                markAffected(selected, reasons, task.id, 'task-input', normalized);
        }
    }
    for (const asset of input.changedAssets ?? []) {
        const normalized = normalizeFilePath(asset);
        for (const id of index.entryIdsByAsset.get(normalized) ?? [])
            markAffected(selected, reasons, id, 'asset', normalized);
        for (const id of index.taskIdsByOutput.get(normalized) ?? [])
            markAffected(selected, reasons, id, 'asset', normalized);
        for (const task of manifest.tasks) {
            if (matchesManifestPatterns(normalized, task.outputs))
                markAffected(selected, reasons, task.id, 'asset', normalized);
        }
    }
    for (const resource of input.changedResources ?? []) {
        const normalized = normalizeManifestResource(resource);
        for (const id of index.entryIdsByResource.get(normalized) ?? [])
            markAffected(selected, reasons, id, 'resource', normalized);
    }
    const ownerRuleIds = [];
    for (const file of input.changedFiles ?? []) {
        const normalized = normalizeFilePath(file);
        const ownerRule = ownerRuleForFile(normalized, manifest.ownerRules);
        if (ownerRule !== undefined) {
            addUnique(ownerRuleIds, ownerRule.id);
            for (const owner of ownerRule.owners) {
                for (const id of index.entryIdsByOwner.get(owner) ?? [])
                    markAffected(selected, reasons, id, 'owner-rule', ownerRule.id);
                for (const id of index.taskIdsByOwner.get(owner) ?? [])
                    markAffected(selected, reasons, id, 'owner-rule', ownerRule.id);
            }
        }
    }
    propagateManifestDependencies(index, selected, reasons);
    const entryIds = Array.from(selected).filter((id) => index.entriesById.has(id)).sort();
    const taskIds = Array.from(selected).filter((id) => index.tasksById.has(id)).sort();
    const entries = entryIds.map((id) => index.entriesById.get(id)).filter((entry) => entry !== undefined);
    const tasks = taskIds.map((id) => index.tasksById.get(id)).filter((task) => task !== undefined);
    const registry = hasRegistryTraversal
        ? frontierRegistryImpact(createManifestRegistryGraph(manifest), input)
        : undefined;
    return {
        kind: FRONTIER_MANIFEST_IMPACT_KIND,
        version: FRONTIER_MANIFEST_IMPACT_VERSION,
        seeds: createImpactSeeds(input, result),
        entryIds,
        taskIds,
        ownerRuleIds: ownerRuleIds.sort(),
        owners: collectOwners(entries, tasks),
        files: collectFiles(entries),
        assets: collectAssets(entries, tasks),
        routes: collectEntryValues(entries, 'routes'),
        actions: collectEntryValues(entries, 'actions'),
        states: collectEntryValues(entries, 'states'),
        migrations: collectEntryValues(entries, 'migrations'),
        tests: collectEntryValues(entries, 'tests'),
        resources: collectEntryValues(entries, 'resources'),
        features: collectFeatures(entries, tasks),
        packages: collectPackages(entries, tasks),
        tags: collectTags(entries, tasks),
        reasons: reasons.sort(compareReason),
        registry
    };
}
function createImpactQueryInput(input) {
    const query = {
        features: input.features,
        packages: input.packages,
        owners: input.owners,
        files: input.files,
        assets: input.assets,
        routes: input.routes,
        actions: input.actions,
        states: input.states,
        migrations: input.migrations,
        tests: input.tests,
        resources: input.resources,
        tags: input.tags
    };
    return hasImpactQueryFields(query) ? query : undefined;
}
function hasImpactQueryFields(input) {
    return hasValues(input.features)
        || hasValues(input.packages)
        || hasValues(input.owners)
        || hasValues(input.files)
        || hasValues(input.assets)
        || hasValues(input.routes)
        || hasValues(input.actions)
        || hasValues(input.states)
        || hasValues(input.migrations)
        || hasValues(input.tests)
        || hasValues(input.resources)
        || hasValues(input.tags)
        || input.text !== undefined;
}
export function createManifestFeatureMap(manifest) {
    const index = getManifestIndex(manifest);
    const features = new Set();
    for (const key of index.entryIdsByFeature.keys())
        features.add(key);
    for (const key of index.taskIdsByFeature.keys())
        features.add(key);
    const nodes = [];
    for (const feature of Array.from(features).sort()) {
        const entryIds = index.entryIdsByFeature.get(feature)?.slice() ?? [];
        const taskIds = index.taskIdsByFeature.get(feature)?.slice() ?? [];
        const entries = entryIds.map((id) => index.entriesById.get(id)).filter((entry) => entry !== undefined);
        const tasks = taskIds.map((id) => index.tasksById.get(id)).filter((task) => task !== undefined);
        nodes[nodes.length] = {
            id: feature,
            entryIds,
            taskIds,
            owners: collectOwners(entries, tasks),
            files: collectFiles(entries),
            assets: collectAssets(entries, tasks),
            routes: collectEntryValues(entries, 'routes'),
            actions: collectEntryValues(entries, 'actions'),
            states: collectEntryValues(entries, 'states'),
            migrations: collectEntryValues(entries, 'migrations'),
            tests: collectEntryValues(entries, 'tests'),
            resources: collectEntryValues(entries, 'resources'),
            packages: collectPackages(entries, tasks),
            tags: collectTags(entries, tasks),
            entryCount: entryIds.length,
            taskCount: taskIds.length
        };
    }
    return {
        kind: FRONTIER_MANIFEST_FEATURE_MAP_KIND,
        version: FRONTIER_MANIFEST_FEATURE_MAP_VERSION,
        generatedAt: manifest.generatedAt,
        summary: { ...manifest.summary, kindCounts: { ...manifest.summary.kindCounts } },
        features: nodes,
        owners: mapToRecord(index.entryIdsByOwner, index.taskIdsByOwner),
        files: mapToRecord(index.entryIdsByFile),
        assets: mapToRecord(index.entryIdsByAsset, index.taskIdsByOutput),
        routes: mapToRecord(index.entryIdsByRoute),
        actions: mapToRecord(index.entryIdsByAction),
        states: mapToRecord(index.entryIdsByState),
        tests: mapToRecord(index.entryIdsByTest)
    };
}
export function createManifestRegistryGraph(manifest, input = {}) {
    const entries = [];
    const records = [];
    const edges = [];
    for (const entry of manifest.entries) {
        entries[entries.length] = manifestEntryToRegistryEntry(entry);
        records[records.length] = createManifestRecord(entry);
        for (const owner of entry.owners)
            edges[edges.length] = { from: entryNode(entry.id), to: ownerNode(owner), kind: 'owned-by' };
        for (const file of entry.files)
            edges[edges.length] = { from: entryNode(entry.id), to: fileNode(file), kind: 'declared-in' };
        for (const route of entry.routes)
            edges[edges.length] = { from: entryNode(entry.id), to: resourceNode('route:' + route), kind: 'handles' };
        for (const asset of entry.assets)
            edges[edges.length] = { from: entryNode(entry.id), to: fileNode(asset), kind: 'touches' };
    }
    for (const task of manifest.tasks) {
        entries[entries.length] = taskToRegistryEntry(task);
        for (const owner of task.owners)
            edges[edges.length] = { from: entryNode(task.id), to: ownerNode(owner), kind: 'owned-by' };
        for (const inputPattern of task.inputs)
            edges[edges.length] = { from: entryNode(task.id), to: patternNode(inputPattern), kind: 'consumes' };
        for (const outputPattern of task.outputs)
            edges[edges.length] = { from: entryNode(task.id), to: patternNode(outputPattern), kind: 'produces' };
    }
    for (const rule of manifest.ownerRules) {
        entries[entries.length] = {
            id: rule.id,
            kind: 'owner-rule',
            description: rule.pattern,
            source: rule.source,
            touches: [patternNode(rule.pattern)],
            tags: ['manifest', 'owner-rule'].concat(rule.tags),
            metadata: compactObject({ owners: rule.owners, pattern: rule.pattern })
        };
        for (const owner of rule.owners)
            edges[edges.length] = { from: entryNode(rule.id), to: ownerNode(owner), kind: 'owns' };
    }
    return createFrontierRegistryGraph({
        entries,
        records,
        edges,
        generatedAt: input.generatedAt ?? manifest.generatedAt,
        metadata: input.metadata ?? manifest.metadata
    });
}
export function createManifestRecord(entry) {
    return {
        id: 'manifest:' + entry.id,
        entryId: entry.id,
        kind: entry.kind,
        status: 'ok',
        reads: entry.reads,
        writes: entry.writes,
        calls: entry.calls,
        affected: entry.resources.concat(entry.assets, entry.routes.map((route) => 'route:' + route)),
        metadata: compactObject({
            files: entry.files,
            owners: entry.owners,
            migrations: entry.migrations,
            tests: entry.tests
        })
    };
}
export function mergeManifests(manifests, input = {}) {
    const entries = [];
    const tasks = [];
    const ownerRules = [];
    for (const manifest of manifests) {
        for (const entry of manifest.entries)
            entries[entries.length] = entry;
        for (const task of manifest.tasks)
            tasks[tasks.length] = task;
        for (const rule of manifest.ownerRules)
            ownerRules[ownerRules.length] = rule;
    }
    return createManifest({
        entries,
        tasks,
        ownerRules,
        generatedAt: input.generatedAt,
        root: input.root,
        metadata: input.metadata
    });
}
export function encodeManifestJsonl(manifest) {
    const lines = [
        stableStringify({
            kind: FRONTIER_MANIFEST_JSONL_KIND,
            version: FRONTIER_MANIFEST_JSONL_VERSION,
            generatedAt: manifest.generatedAt,
            root: manifest.root,
            metadata: manifest.metadata
        })
    ];
    for (const entry of manifest.entries)
        lines[lines.length] = stableStringify({ type: 'entry', entry });
    for (const task of manifest.tasks)
        lines[lines.length] = stableStringify({ type: 'task', task });
    for (const ownerRule of manifest.ownerRules)
        lines[lines.length] = stableStringify({ type: 'ownerRule', ownerRule });
    return lines.join('\n') + '\n';
}
export function decodeManifestJsonl(text) {
    const entries = [];
    const tasks = [];
    const ownerRules = [];
    let generatedAt;
    let root;
    let metadata;
    for (const raw of String(text).split(/\r?\n/)) {
        const line = raw.trim();
        if (line.length === 0)
            continue;
        const parsed = JSON.parse(line);
        if (parsed.kind === FRONTIER_MANIFEST_JSONL_KIND) {
            generatedAt = typeof parsed.generatedAt === 'number' ? parsed.generatedAt : undefined;
            root = typeof parsed.root === 'string' ? parsed.root : undefined;
            metadata = parsed.metadata;
        }
        else if (parsed.type === 'entry') {
            entries[entries.length] = parsed.entry;
        }
        else if (parsed.type === 'task') {
            tasks[tasks.length] = parsed.task;
        }
        else if (parsed.type === 'ownerRule') {
            ownerRules[ownerRules.length] = parsed.ownerRule;
        }
    }
    return createManifest({ entries, tasks, ownerRules, generatedAt, root, metadata });
}
export function createManifestProof(manifest) {
    const payload = {
        kind: manifest.kind,
        version: manifest.version,
        root: manifest.root,
        entries: manifest.entries,
        tasks: manifest.tasks,
        ownerRules: manifest.ownerRules,
        metadata: manifest.metadata
    };
    return {
        kind: FRONTIER_MANIFEST_PROOF_KIND,
        version: FRONTIER_MANIFEST_PROOF_VERSION,
        hash: fnv1a(stableStringify(payload)).toString(16).padStart(8, '0'),
        entryCount: manifest.summary.entryCount,
        taskCount: manifest.summary.taskCount,
        ownerRuleCount: manifest.summary.ownerRuleCount,
        fileCount: manifest.summary.fileCount,
        assetCount: manifest.summary.assetCount,
        resourceCount: manifest.summary.resourceCount
    };
}
export function normalizeManifestResource(resource, fallbackScheme = 'manifest') {
    const value = normalizeId(resource, 'manifest resource');
    if (/^[a-z][a-z0-9+.-]*:/i.test(value))
        return value;
    return fallbackScheme + ':' + value;
}
export function matchesManifestPattern(file, pattern) {
    return globToRegExp(pattern).test(normalizeFilePath(file));
}
export function matchesManifestPatterns(file, patterns) {
    const normalized = normalizeFilePath(file);
    let matched = false;
    for (const rawPattern of patterns) {
        const pattern = normalizeFilePattern(rawPattern);
        if (pattern.startsWith('!')) {
            if (pattern.length > 1 && matchesManifestPattern(normalized, pattern.slice(1)))
                matched = false;
        }
        else if (matchesManifestPattern(normalized, pattern)) {
            matched = true;
        }
    }
    return matched;
}
function normalizeEntry(input) {
    const id = normalizeId(input.id, 'manifest entry id');
    const files = normalizeFileList(input.files);
    const source = cloneSource(input.source);
    const sourceFileList = sourceFiles(source);
    return {
        id,
        kind: normalizeId(input.kind, 'manifest entry kind'),
        name: normalizeOptionalString(input.name) ?? id,
        description: normalizeOptionalString(input.description),
        package: normalizeOptionalString(input.package),
        feature: normalizeOptionalString(input.feature),
        owner: normalizeOptionalString(input.owner),
        owners: uniqueStrings([input.owner, ...(input.owners ?? [])]).sort(),
        version: normalizeOptionalString(input.version),
        contentHash: normalizeOptionalString(input.contentHash),
        source,
        files: uniqueStrings(files.concat(sourceFileList)).sort(),
        assets: normalizeFileList(input.assets),
        routes: normalizeStringList(input.routes?.map(normalizeRoute)),
        actions: normalizeStringList(input.actions),
        states: normalizePathList(input.states),
        migrations: normalizeStringList(input.migrations),
        tests: normalizeStringList(input.tests),
        resources: normalizeStringList(input.resources?.map((resource) => normalizeManifestResource(resource))),
        reads: normalizePathList(input.reads),
        writes: normalizePathList(input.writes),
        calls: normalizeStringList(input.calls),
        dependsOn: normalizeStringList(input.dependsOn),
        invalidates: normalizeStringList(input.invalidates),
        affects: normalizeStringList(input.affects),
        observes: normalizeStringList(input.observes),
        consumes: normalizeStringList(input.consumes),
        produces: normalizeStringList(input.produces),
        emits: normalizeStringList(input.emits),
        covers: normalizeStringList(input.covers),
        tags: normalizeStringList(input.tags),
        metadata: cloneJsonObject(input.metadata)
    };
}
function normalizeOwnerRule(input) {
    const pattern = normalizeFilePattern(input.pattern);
    return {
        id: normalizeOptionalString(input.id) ?? 'owner-rule:' + hashHex32(pattern + ':' + input.owners.join('|')).slice(0, 12),
        pattern,
        owners: normalizeStringList(input.owners),
        source: cloneSource(input.source),
        tags: normalizeStringList(input.tags),
        metadata: cloneJsonObject(input.metadata)
    };
}
function normalizeTask(input) {
    const id = normalizeId(input.id, 'manifest task id');
    return {
        id,
        command: normalizeOptionalString(input.command),
        package: normalizeOptionalString(input.package),
        feature: normalizeOptionalString(input.feature),
        owner: normalizeOptionalString(input.owner),
        owners: uniqueStrings([input.owner, ...(input.owners ?? [])]).sort(),
        inputs: normalizePatternList(input.inputs),
        outputs: normalizePatternList(input.outputs),
        dependsOn: normalizeStringList(input.dependsOn),
        cache: input.cache,
        env: normalizeStringList(input.env),
        tags: normalizeStringList(input.tags),
        metadata: cloneJsonObject(input.metadata)
    };
}
function applyOwnerRules(entries, tasks, rules) {
    if (rules.length === 0)
        return;
    for (const entry of entries) {
        if (entry.owners.length !== 0)
            continue;
        const owners = ownersForFiles(entry.files.concat(entry.assets), rules);
        if (owners.length !== 0) {
            entry.owners = owners;
            entry.owner = owners[0];
        }
    }
    for (const task of tasks) {
        if (task.owners.length !== 0)
            continue;
        const owners = ownersForFiles(task.inputs.concat(task.outputs), rules);
        if (owners.length !== 0) {
            task.owners = owners;
            task.owner = owners[0];
        }
    }
}
function ownersForFiles(files, rules) {
    const owners = [];
    for (const file of files) {
        const rule = ownerRuleForFile(file, rules);
        if (rule !== undefined)
            for (const owner of rule.owners)
                addUnique(owners, owner);
    }
    return owners.sort();
}
function ownerRuleForFile(file, rules) {
    let matched;
    for (const rule of rules) {
        if (matchesManifestPattern(file, rule.pattern))
            matched = rule;
    }
    return matched;
}
function validateManifestParts(entries, tasks, ownerRules) {
    const diagnostics = [];
    const knownIds = new Set();
    for (const entry of entries)
        knownIds.add(entry.id);
    for (const task of tasks)
        knownIds.add(task.id);
    const ids = new Set();
    for (const entry of entries) {
        if (ids.has(entry.id))
            diagnostics[diagnostics.length] = error('duplicate-id', 'manifest id is declared more than once: ' + entry.id, { entryId: entry.id });
        ids.add(entry.id);
        for (const dependency of entry.dependsOn) {
            if (!knownIds.has(dependency)) {
                diagnostics[diagnostics.length] = warning('missing-dependency', 'manifest entry references an unknown dependency: ' + dependency, { entryId: entry.id });
            }
        }
    }
    for (const task of tasks) {
        if (ids.has(task.id))
            diagnostics[diagnostics.length] = error('duplicate-id', 'manifest id is declared more than once: ' + task.id, { taskId: task.id });
        ids.add(task.id);
        for (const dependency of task.dependsOn) {
            if (!knownIds.has(dependency)) {
                diagnostics[diagnostics.length] = warning('missing-task-dependency', 'manifest task references an unknown dependency: ' + dependency, { taskId: task.id });
            }
        }
    }
    const ruleIds = new Set();
    for (const rule of ownerRules) {
        if (ruleIds.has(rule.id))
            diagnostics[diagnostics.length] = error('duplicate-owner-rule', 'owner rule id is declared more than once: ' + rule.id, { ownerRuleId: rule.id });
        ruleIds.add(rule.id);
        if (rule.owners.length === 0)
            diagnostics[diagnostics.length] = warning('owner-rule-empty', 'owner rule has no owners: ' + rule.id, { ownerRuleId: rule.id });
    }
    return diagnostics;
}
function summarizeManifestParts(entries, tasks, ownerRules, diagnostics) {
    const features = new Set();
    const owners = new Set();
    const packages = new Set();
    const routes = new Set();
    const actions = new Set();
    const states = new Set();
    const migrations = new Set();
    const tests = new Set();
    const files = new Set();
    const assets = new Set();
    const resources = new Set();
    const tags = new Set();
    const kindCounts = {};
    let errorCount = 0;
    for (const entry of entries) {
        kindCounts[entry.kind] = (kindCounts[entry.kind] ?? 0) + 1;
        if (entry.feature !== undefined)
            features.add(entry.feature);
        if (entry.package !== undefined)
            packages.add(entry.package);
        collectSet(owners, entry.owners);
        collectSet(files, entry.files);
        collectSet(assets, entry.assets);
        collectSet(routes, entry.routes);
        collectSet(actions, entry.actions);
        collectSet(states, entry.states);
        collectSet(migrations, entry.migrations);
        collectSet(tests, entry.tests);
        collectSet(resources, entry.resources);
        collectSet(tags, entry.tags);
    }
    for (const task of tasks) {
        if (task.feature !== undefined)
            features.add(task.feature);
        if (task.package !== undefined)
            packages.add(task.package);
        collectSet(owners, task.owners);
        collectSet(files, task.inputs);
        collectSet(assets, task.outputs);
        collectSet(tags, task.tags);
    }
    for (const rule of ownerRules)
        collectSet(owners, rule.owners);
    for (const diagnostic of diagnostics)
        if (diagnostic.severity === 'error')
            errorCount++;
    return {
        entryCount: entries.length,
        taskCount: tasks.length,
        ownerRuleCount: ownerRules.length,
        featureCount: features.size,
        ownerCount: owners.size,
        packageCount: packages.size,
        routeCount: routes.size,
        actionCount: actions.size,
        stateCount: states.size,
        migrationCount: migrations.size,
        testCount: tests.size,
        fileCount: files.size,
        assetCount: assets.size,
        resourceCount: resources.size,
        tagCount: tags.size,
        errorCount,
        warningCount: diagnostics.length - errorCount,
        kindCounts
    };
}
function getManifestIndex(manifest) {
    const cached = MANIFEST_INDEX.get(manifest);
    if (cached !== undefined)
        return cached;
    const index = createManifestIndex(manifest);
    MANIFEST_INDEX.set(manifest, index);
    return index;
}
function createManifestIndex(manifest) {
    const index = {
        entryIds: [],
        taskIds: [],
        entriesById: new Map(),
        tasksById: new Map(),
        entryIdsByKind: new Map(),
        entryIdsByFeature: new Map(),
        taskIdsByFeature: new Map(),
        entryIdsByPackage: new Map(),
        taskIdsByPackage: new Map(),
        entryIdsByOwner: new Map(),
        taskIdsByOwner: new Map(),
        entryIdsByFile: new Map(),
        entryIdsByAsset: new Map(),
        taskIdsByInput: new Map(),
        taskIdsByOutput: new Map(),
        entryIdsByRoute: new Map(),
        entryIdsByAction: new Map(),
        entryIdsByState: new Map(),
        entryIdsByMigration: new Map(),
        entryIdsByTest: new Map(),
        entryIdsByResource: new Map(),
        entryIdsByTag: new Map(),
        taskIdsByTag: new Map(),
        dependentsById: new Map()
    };
    for (const entry of manifest.entries) {
        index.entryIds[index.entryIds.length] = entry.id;
        index.entriesById.set(entry.id, entry);
        appendMapArray(index.entryIdsByKind, entry.kind, entry.id);
        if (entry.feature !== undefined)
            appendMapArray(index.entryIdsByFeature, entry.feature, entry.id);
        if (entry.package !== undefined)
            appendMapArray(index.entryIdsByPackage, entry.package, entry.id);
        appendMapValues(index.entryIdsByOwner, entry.owners, entry.id);
        appendMapValues(index.entryIdsByFile, entry.files, entry.id);
        appendMapValues(index.entryIdsByAsset, entry.assets, entry.id);
        appendMapValues(index.entryIdsByRoute, entry.routes, entry.id);
        appendMapValues(index.entryIdsByAction, entry.actions, entry.id);
        appendMapValues(index.entryIdsByState, entry.states, entry.id);
        appendMapValues(index.entryIdsByMigration, entry.migrations, entry.id);
        appendMapValues(index.entryIdsByTest, entry.tests, entry.id);
        appendMapValues(index.entryIdsByResource, entry.resources, entry.id);
        appendMapValues(index.entryIdsByTag, entry.tags, entry.id);
        for (const dependency of entry.dependsOn)
            appendMapArray(index.dependentsById, dependency, entry.id);
    }
    for (const task of manifest.tasks) {
        index.taskIds[index.taskIds.length] = task.id;
        index.tasksById.set(task.id, task);
        if (task.feature !== undefined)
            appendMapArray(index.taskIdsByFeature, task.feature, task.id);
        if (task.package !== undefined)
            appendMapArray(index.taskIdsByPackage, task.package, task.id);
        appendMapValues(index.taskIdsByOwner, task.owners, task.id);
        appendMapValues(index.taskIdsByInput, task.inputs, task.id);
        appendMapValues(index.taskIdsByOutput, task.outputs, task.id);
        appendMapValues(index.taskIdsByTag, task.tags, task.id);
        for (const dependency of task.dependsOn)
            appendMapArray(index.dependentsById, dependency, task.id);
    }
    return index;
}
function manifestEntryToRegistryEntry(entry) {
    return {
        id: entry.id,
        kind: entry.kind,
        description: entry.description ?? entry.name,
        package: entry.package,
        feature: entry.feature,
        owner: entry.owner,
        version: entry.version,
        contentHash: entry.contentHash,
        source: entry.source,
        reads: entry.reads,
        writes: entry.writes,
        calls: entry.calls,
        dependsOn: entry.dependsOn,
        invalidates: entry.invalidates,
        affects: entry.affects,
        observes: entry.observes,
        consumes: entry.consumes.concat(entry.files),
        produces: entry.produces.concat(entry.assets),
        emits: entry.emits,
        covers: entry.covers.concat(entry.tests),
        touches: entry.resources.concat(entry.assets.map(fileNode), entry.files.map(fileNode)),
        handles: entry.routes.map((route) => 'route:' + route).concat(entry.actions.map((action) => 'action:' + action)),
        tags: ['manifest', entry.kind].concat(entry.tags),
        metadata: compactObject({
            files: entry.files,
            assets: entry.assets,
            routes: entry.routes,
            actions: entry.actions,
            states: entry.states,
            migrations: entry.migrations,
            tests: entry.tests,
            owners: entry.owners
        })
    };
}
function taskToRegistryEntry(task) {
    return {
        id: task.id,
        kind: 'task',
        description: task.command,
        package: task.package,
        feature: task.feature,
        owner: task.owner,
        dependsOn: task.dependsOn,
        consumes: task.inputs.map(patternNode),
        produces: task.outputs.map(patternNode),
        tags: ['manifest', 'task'].concat(task.tags),
        metadata: compactObject({
            command: task.command,
            inputs: task.inputs,
            outputs: task.outputs,
            cache: task.cache,
            env: task.env,
            owners: task.owners
        })
    };
}
function markAffected(selected, reasons, id, kind, via) {
    if (selected.has(id) && kind !== 'dependency')
        return;
    selected.add(id);
    const key = id + '|' + kind + '|' + (via ?? '');
    if (!reasons.some((reason) => reason.id + '|' + reason.kind + '|' + (reason.via ?? '') === key)) {
        reasons[reasons.length] = { id, kind, via };
    }
}
function propagateManifestDependencies(index, selected, reasons) {
    const queue = Array.from(selected);
    for (let cursor = 0; cursor < queue.length; cursor++) {
        const id = queue[cursor];
        for (const dependent of index.dependentsById.get(id) ?? []) {
            if (!selected.has(dependent)) {
                selected.add(dependent);
                queue[queue.length] = dependent;
                reasons[reasons.length] = { id: dependent, kind: 'dependency', via: id };
            }
        }
    }
}
function createImpactSeeds(input, result) {
    return uniqueStrings([
        ...(input.ids ?? []),
        ...(input.nodes ?? []),
        ...(input.features ?? []).map((feature) => 'feature:' + feature),
        ...(input.packages ?? []).map((packageName) => 'package:' + packageName),
        ...(input.owners ?? []).map((owner) => 'owner:' + owner),
        ...(input.files ?? []).map((file) => 'file:' + normalizeFilePath(file)),
        ...(input.assets ?? []).map((asset) => 'asset:' + normalizeFilePath(asset)),
        ...(input.routes ?? []).map((route) => 'route:' + normalizeRoute(route)),
        ...(input.actions ?? []).map((action) => 'action:' + action),
        ...(input.states ?? []).map((state) => 'state:' + normalizeFrontierRegistryPath(state)),
        ...(input.migrations ?? []).map((migration) => 'migration:' + migration),
        ...(input.tests ?? []).map((test) => 'test:' + test),
        ...(input.resources ?? []).map((resource) => normalizeManifestResource(resource)),
        ...(input.tags ?? []).map((tag) => 'tag:' + tag),
        ...(input.changedFiles ?? []).map(normalizeFilePath),
        ...(input.changedAssets ?? []).map(normalizeFilePath),
        ...(input.changedResources ?? []).map((resource) => normalizeManifestResource(resource)),
        ...(result?.entries ?? []).map((entry) => entry.id),
        ...(result?.tasks ?? []).map((task) => task.id)
    ]).sort();
}
function entryMatchesChangedFile(entry, file) {
    if (entry.files.includes(file) || entry.assets.includes(file))
        return true;
    for (const pattern of entry.files.concat(entry.assets))
        if (isPattern(pattern) && matchesManifestPattern(file, pattern))
            return true;
    return false;
}
function taskMatchesChangedFile(task, file) {
    return matchesManifestPatterns(file, task.inputs);
}
function entryMatchesText(entry, text) {
    return [
        entry.id,
        entry.kind,
        entry.name,
        entry.description,
        entry.package,
        entry.feature,
        entry.owner,
        ...entry.owners,
        ...entry.files,
        ...entry.assets,
        ...entry.routes,
        ...entry.actions,
        ...entry.states,
        ...entry.migrations,
        ...entry.tests,
        ...entry.resources,
        ...entry.tags,
        ...sourceFiles(entry.source)
    ].filter((value) => value !== undefined).join(' ').toLowerCase().includes(text);
}
function taskMatchesText(task, text) {
    return [
        task.id,
        task.command,
        task.package,
        task.feature,
        task.owner,
        ...task.owners,
        ...task.inputs,
        ...task.outputs,
        ...task.dependsOn,
        ...task.env,
        ...task.tags
    ].filter((value) => value !== undefined).join(' ').toLowerCase().includes(text);
}
function collectOwners(entries, tasks) {
    const values = new Set();
    for (const entry of entries)
        collectSet(values, entry.owners);
    for (const task of tasks)
        collectSet(values, task.owners);
    return Array.from(values).sort();
}
function collectFiles(entries) {
    const values = new Set();
    for (const entry of entries)
        collectSet(values, entry.files);
    return Array.from(values).sort();
}
function collectAssets(entries, tasks) {
    const values = new Set();
    for (const entry of entries)
        collectSet(values, entry.assets);
    for (const task of tasks)
        collectSet(values, task.outputs);
    return Array.from(values).sort();
}
function collectEntryValues(entries, key) {
    const values = new Set();
    for (const entry of entries)
        collectSet(values, entry[key]);
    return Array.from(values).sort();
}
function collectFeatures(entries, tasks) {
    const values = new Set();
    for (const entry of entries)
        if (entry.feature !== undefined)
            values.add(entry.feature);
    for (const task of tasks)
        if (task.feature !== undefined)
            values.add(task.feature);
    return Array.from(values).sort();
}
function collectPackages(entries, tasks) {
    const values = new Set();
    for (const entry of entries)
        if (entry.package !== undefined)
            values.add(entry.package);
    for (const task of tasks)
        if (task.package !== undefined)
            values.add(task.package);
    return Array.from(values).sort();
}
function collectTags(entries, tasks) {
    const values = new Set();
    for (const entry of entries)
        collectSet(values, entry.tags);
    for (const task of tasks)
        collectSet(values, task.tags);
    return Array.from(values).sort();
}
function cloneQuery(input) {
    return {
        ids: input.ids?.map(String),
        kinds: input.kinds?.map(String),
        features: input.features?.map(String),
        packages: input.packages?.map(String),
        owners: input.owners?.map(String),
        files: input.files?.map(normalizeFilePath),
        assets: input.assets?.map(normalizeFilePath),
        routes: input.routes?.map(normalizeRoute),
        actions: input.actions?.map(String),
        states: input.states?.map(normalizeFrontierRegistryPath),
        migrations: input.migrations?.map(String),
        tests: input.tests?.map(String),
        resources: input.resources?.map((resource) => normalizeManifestResource(resource)),
        tags: input.tags?.map(String),
        text: input.text,
        limit: input.limit
    };
}
function cloneEntry(entry) {
    return {
        ...entry,
        source: cloneSource(entry.source),
        owners: entry.owners.slice(),
        files: entry.files.slice(),
        assets: entry.assets.slice(),
        routes: entry.routes.slice(),
        actions: entry.actions.slice(),
        states: entry.states.slice(),
        migrations: entry.migrations.slice(),
        tests: entry.tests.slice(),
        resources: entry.resources.slice(),
        reads: entry.reads.slice(),
        writes: entry.writes.slice(),
        calls: entry.calls.slice(),
        dependsOn: entry.dependsOn.slice(),
        invalidates: entry.invalidates.slice(),
        affects: entry.affects.slice(),
        observes: entry.observes.slice(),
        consumes: entry.consumes.slice(),
        produces: entry.produces.slice(),
        emits: entry.emits.slice(),
        covers: entry.covers.slice(),
        tags: entry.tags.slice(),
        metadata: cloneJsonObject(entry.metadata)
    };
}
function cloneTask(task) {
    return {
        ...task,
        owners: task.owners.slice(),
        inputs: task.inputs.slice(),
        outputs: task.outputs.slice(),
        dependsOn: task.dependsOn.slice(),
        env: task.env.slice(),
        tags: task.tags.slice(),
        metadata: cloneJsonObject(task.metadata)
    };
}
function cloneOwnerRule(rule) {
    return {
        ...rule,
        owners: rule.owners.slice(),
        source: cloneSource(rule.source),
        tags: rule.tags.slice(),
        metadata: cloneJsonObject(rule.metadata)
    };
}
function idsFromMap(map, values) {
    if (values === undefined)
        return undefined;
    const out = [];
    for (const value of values) {
        const ids = map.get(value);
        if (ids !== undefined)
            for (const id of ids)
                addUnique(out, id);
    }
    return out;
}
function taskIdsForFiles(index, tasks, files, direction) {
    if (files === undefined)
        return undefined;
    const out = [];
    const exactMap = direction === 'input' ? index.taskIdsByInput : index.taskIdsByOutput;
    for (const file of files) {
        for (const id of exactMap.get(file) ?? [])
            addUnique(out, id);
        for (const task of tasks) {
            const patterns = direction === 'input' ? task.inputs : task.outputs;
            if (matchesManifestPatterns(file, patterns))
                addUnique(out, task.id);
        }
    }
    return out;
}
function intersectCandidate(current, next) {
    if (next === undefined)
        return current;
    const normalized = uniqueStrings(next.map(String));
    if (current === null)
        return normalized;
    const nextSet = new Set(normalized);
    return current.filter((id) => nextSet.has(id));
}
function appendMapValues(map, values, id) {
    for (const value of values)
        appendMapArray(map, value, id);
}
function appendMapArray(map, key, value) {
    const bucket = map.get(key);
    if (bucket === undefined)
        map.set(key, [value]);
    else if (!bucket.includes(value))
        bucket[bucket.length] = value;
}
function mapToRecord(...maps) {
    const out = {};
    for (const map of maps) {
        if (map === undefined)
            continue;
        for (const [key, values] of map) {
            const bucket = out[key] ?? [];
            for (const value of values)
                addUnique(bucket, value);
            out[key] = bucket.sort();
        }
    }
    return Object.fromEntries(Object.entries(out).sort(([left], [right]) => left.localeCompare(right)));
}
function normalizeFilePath(value) {
    const out = normalizeId(value, 'manifest file').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
    return out.startsWith('/') ? out.slice(1) : out;
}
function normalizeFilePattern(value) {
    return normalizeId(value, 'manifest file pattern').replace(/\\/g, '/').replace(/^\.\//, '').replace(/\/+/g, '/');
}
function normalizeRoute(value) {
    const out = normalizeId(value, 'manifest route');
    return out.startsWith('/') ? out : '/' + out;
}
function normalizePatternList(values) {
    return uniqueStrings((values ?? []).map(normalizeFilePattern)).sort();
}
function normalizeFileList(values) {
    return uniqueStrings((values ?? []).map(normalizeFilePath)).sort();
}
function normalizePathList(values) {
    return uniqueStrings((values ?? []).map(normalizeFrontierRegistryPath)).sort();
}
function normalizeStringList(values) {
    return uniqueStrings((values ?? []).map((value) => normalizeOptionalString(value))).sort();
}
function normalizeId(value, label) {
    const out = String(value ?? '').trim();
    if (out.length === 0)
        throw new TypeError(label + ' must be a non-empty string');
    return out;
}
function normalizeOptionalString(value) {
    if (value === undefined || value === null)
        return undefined;
    const out = String(value).trim();
    return out.length === 0 ? undefined : out;
}
function cloneSource(source) {
    if (source === undefined)
        return undefined;
    if (Array.isArray(source))
        return source.map((item) => ({ ...item, file: normalizeFilePath(item.file) }));
    const location = source;
    return { ...source, file: normalizeFilePath(location.file) };
}
function sourceFiles(source) {
    if (source === undefined)
        return [];
    const sources = Array.isArray(source) ? source : [source];
    return uniqueStrings(sources.map((item) => normalizeFilePath(item.file)));
}
function globToRegExp(pattern) {
    let source = normalizeFilePattern(pattern);
    const cached = GLOB_REGEX_CACHE.get(source);
    if (cached !== undefined)
        return cached;
    let anchored = false;
    const cacheKey = source;
    if (source.startsWith('/')) {
        anchored = true;
        source = source.slice(1);
    }
    if (source.endsWith('/'))
        source += '**';
    const hasSlash = source.includes('/');
    let out = '';
    for (let i = 0; i < source.length; i++) {
        const char = source[i];
        const next = source[i + 1];
        if (char === '*' && next === '*') {
            out += '.*';
            i++;
        }
        else if (char === '*') {
            out += '[^/]*';
        }
        else if (char === '?') {
            out += '[^/]';
        }
        else {
            out += escapeRegex(char);
        }
    }
    const prefix = anchored ? '^' : hasSlash ? '^(?:.*/)?' : '^(?:.*/)?';
    const regex = new RegExp(prefix + out + '$');
    GLOB_REGEX_CACHE.set(cacheKey, regex);
    return regex;
}
function isPattern(value) {
    return value.includes('*') || value.includes('?') || value.startsWith('/');
}
function hasAnyArray(values, set) {
    for (const value of values)
        if (set.has(value))
            return true;
    return false;
}
function hasValues(values) {
    return values !== undefined && values.length !== 0;
}
function compareReason(left, right) {
    return left.id.localeCompare(right.id) || left.kind.localeCompare(right.kind) || (left.via ?? '').localeCompare(right.via ?? '');
}
function collectSet(target, values) {
    for (const value of values)
        target.add(value);
}
function uniqueStrings(values) {
    const out = [];
    const seen = new Set();
    for (const value of values) {
        if (value === undefined || value === null)
            continue;
        const item = String(value);
        if (item.length !== 0 && !seen.has(item)) {
            seen.add(item);
            out[out.length] = item;
        }
    }
    return out;
}
function addUnique(out, value) {
    if (value.length !== 0 && !out.includes(value))
        out[out.length] = value;
}
function entryNode(id) {
    return 'entry:' + id;
}
function ownerNode(owner) {
    return 'owner:' + owner;
}
function fileNode(file) {
    return 'file:' + file;
}
function patternNode(pattern) {
    return 'pattern:' + pattern;
}
function resourceNode(resource) {
    return normalizeManifestResource(resource);
}
function error(code, message, extra) {
    return { severity: 'error', code, message, ...extra };
}
function warning(code, message, extra) {
    return { severity: 'warning', code, message, ...extra };
}
function compactObject(value) {
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        const json = toJsonValue(item);
        if (json !== undefined)
            out[key] = json;
    }
    return out;
}
function cloneJsonObject(value) {
    const json = toJsonValue(value);
    return json !== undefined && json !== null && typeof json === 'object' && !Array.isArray(json) ? json : undefined;
}
function toJsonValue(value) {
    if (value === undefined || typeof value === 'function' || typeof value === 'symbol' || typeof value === 'bigint')
        return undefined;
    if (value === null || typeof value === 'string' || typeof value === 'boolean')
        return value;
    if (typeof value === 'number')
        return Number.isFinite(value) ? value : null;
    if (Array.isArray(value)) {
        const out = [];
        for (const item of value) {
            const json = toJsonValue(item);
            out[out.length] = json === undefined ? null : json;
        }
        return out;
    }
    const out = {};
    for (const [key, item] of Object.entries(value)) {
        const json = toJsonValue(item);
        if (json !== undefined)
            out[key] = json;
    }
    return out;
}
function stableStringify(value) {
    return JSON.stringify(sortJson(toJsonValue(value)));
}
function sortJson(value) {
    if (value === undefined || value === null || typeof value !== 'object')
        return value;
    if (Array.isArray(value))
        return value.map(sortJson);
    const out = {};
    for (const key of Object.keys(value).sort())
        out[key] = sortJson(value[key]);
    return out;
}
function hashHex32(value) {
    const a = fnv1a(value + ':0').toString(16).padStart(8, '0');
    const b = fnv1a(value + ':1').toString(16).padStart(8, '0');
    const c = fnv1a(value + ':2').toString(16).padStart(8, '0');
    const d = fnv1a(value + ':3').toString(16).padStart(8, '0');
    return (a + b + c + d).slice(0, 32);
}
function fnv1a(value) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < value.length; i++) {
        hash ^= value.charCodeAt(i);
        hash = Math.imul(hash, 0x01000193);
    }
    return hash >>> 0;
}
function escapeRegex(value) {
    return value.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}
//# sourceMappingURL=index.js.map