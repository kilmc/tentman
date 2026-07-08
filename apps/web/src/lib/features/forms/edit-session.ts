import type { BlockRegistry } from '$lib/blocks/registry';
import type { BlockUsage, EditorLayoutConfig } from '$lib/config/types';
import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';
import { getRepeatableItemLabel } from '$lib/features/forms/repeatable-labels';

export type ContentPath = Array<string | number>;
export type RepeatablePanelMode = 'create' | 'edit';
export type FormPanelKind = 'repeatable' | 'object';

interface BasePanelInput {
	id: string;
	kind: FormPanelKind;
	mode: RepeatablePanelMode;
	label: string;
	listLabel: string;
	title: string;
	blocks: BlockUsage[];
	editorLayout?: EditorLayoutConfig;
	selectedItem: ContentRecord;
	targetPath: ContentPath;
	itemFieldPath?: string;
	imagePath?: string;
	configPath?: string;
	defaultAssetStoragePath?: string;
	blockRegistry: BlockRegistry;
	navigationManifest?: NavigationManifest | null;
	onaddselectoption?: (input: {
		collection: string;
		id: string;
		value: string;
		label: string;
	}) => Promise<void>;
}

export interface OpenRepeatablePanelInput extends BasePanelInput {
	kind: 'repeatable';
	selectedIndex: number;
	arrayPath: ContentPath;
}

export interface OpenObjectPanelInput extends BasePanelInput {
	kind: 'object';
}

export type OpenPanelInput = OpenRepeatablePanelInput | OpenObjectPanelInput;

interface BasePanelView extends BasePanelInput {
	selectedItem: ContentRecord;
	isDirty: boolean;
	submitError?: string;
	hasParentPanel: boolean;
	parentPanelTitle?: string;
}

export interface RepeatablePanelView extends BasePanelView {
	kind: 'repeatable';
	selectedIndex: number;
	arrayPath: ContentPath;
}

export interface ObjectPanelView extends BasePanelView {
	kind: 'object';
}

export type FormPanelView = RepeatablePanelView | ObjectPanelView;

export interface FormDirtyState {
	isDirty: boolean;
	hasPanelDraft: boolean;
	hasCreatePanelDraft: boolean;
}

export interface SemanticFieldFingerprint {
	kind: 'markdown';
	path: string;
	baselineFingerprint: string;
	currentFingerprint: string;
}

export type PrepareSubmitResult =
	| { ok: true; data: ContentRecord }
	| { ok: false; data: ContentRecord; message: string };

export interface FormEditSessionRecoveryPanel {
	id: string;
	kind: FormPanelKind;
	mode: RepeatablePanelMode;
	label: string;
	listLabel: string;
	title: string;
	blocks: BlockUsage[];
	editorLayout?: EditorLayoutConfig;
	selectedItem: ContentRecord;
	targetPath: ContentPath;
	itemFieldPath?: string;
	imagePath?: string;
	configPath?: string;
	defaultAssetStoragePath?: string;
	selectedIndex?: number;
	arrayPath?: ContentPath;
	draftItem: ContentRecord;
	initialItem: ContentRecord;
	submitError?: string;
}

export interface FormEditSessionRecoveryState {
	data: ContentRecord;
	baseline: ContentRecord;
	panelStack: FormEditSessionRecoveryPanel[];
}

type PanelEntry = (OpenRepeatablePanelInput | OpenObjectPanelInput) & {
	draftItem: ContentRecord;
	initialItem: ContentRecord;
	submitError?: string;
};

type SemanticFingerprintSide = 'baseline' | 'current';

type StoredSemanticFieldFingerprint = SemanticFieldFingerprint & {
	parsedPath: ContentPath;
	pathKey: string;
};

interface FormEditSessionOptions {
	onChange?: (state: FormDirtyState) => void;
	onPanelChange?: (panel: FormPanelView | null) => void;
}

export interface FormEditSession {
	getData: () => ContentRecord;
	setData: (data: ContentRecord) => void;
	updateData: (data: ContentRecord) => void;
	getBaselineFieldValue: (path: string) => ContentValue | undefined;
	updateSemanticFieldFingerprint: (fingerprint: SemanticFieldFingerprint) => void;
	getDirtyState: () => FormDirtyState;
	getActivePanel: () => FormPanelView | null;
	openPanel: (panel: OpenPanelInput) => void;
	updatePanelField: (blockId: string, value: ContentValue | undefined) => void;
	reorderArrayItems: (
		arrayPath: ContentPath,
		nextItems: ContentValue[],
		indexMap?: Map<number, number>
	) => void;
	commitPanel: () => void;
	closePanel: () => void;
	discardPanel: () => void;
	removePanelItem: () => void;
	prepareSubmit: () => PrepareSubmitResult;
	markSaved: (data?: ContentRecord) => void;
	exportRecoveryState: () => FormEditSessionRecoveryState;
	restoreRecoveryState: (
		state: FormEditSessionRecoveryState,
		runtime: Pick<BasePanelInput, 'blockRegistry' | 'navigationManifest' | 'onaddselectoption'>
	) => void;
	destroy: () => void;
}

export function createFormEditSession(
	initialData: ContentRecord,
	options: FormEditSessionOptions = {}
): FormEditSession {
	let data = cloneContentRecord(initialData);
	let baseline = cloneContentRecord(initialData);
	let panelStack: PanelEntry[] = [];
	let semanticFieldFingerprints = new Map<string, StoredSemanticFieldFingerprint>();

	function getDirtyState(): FormDirtyState {
		return {
			isDirty:
				getFingerprint(data, [], 'current', semanticFieldFingerprints) !==
					getFingerprint(baseline, [], 'baseline', semanticFieldFingerprints) ||
				panelStack.some((panel) => isPanelDirty(panel, semanticFieldFingerprints)),
			hasPanelDraft: panelStack.some((panel) => isPanelDirty(panel, semanticFieldFingerprints)),
			hasCreatePanelDraft: panelStack.some(
				(panel) => panel.mode === 'create' && isPanelDirty(panel, semanticFieldFingerprints)
			)
		};
	}

	function getActiveEntry(): PanelEntry | null {
		return panelStack.at(-1) ?? null;
	}

	function getActivePanel(): FormPanelView | null {
		const active = getActiveEntry();
		if (!active) {
			return null;
		}

		return toPanelView(active, getParentEntry(active), semanticFieldFingerprints);
	}

	function notify() {
		options.onChange?.(getDirtyState());
		options.onPanelChange?.(getActivePanel());
	}

	function setData(nextData: ContentRecord) {
		data = cloneContentRecord(nextData);
		notify();
	}

	function updateData(nextData: ContentRecord) {
		data = nextData;
		notify();
	}

	function getBaselineFieldValue(path: string): ContentValue | undefined {
		const parsedPath = parseFieldPath(path);
		const active = getActiveEntry();
		if (active && pathStartsWith(parsedPath, active.targetPath)) {
			return getValueAtPath(active.initialItem, getRelativePath(active, parsedPath));
		}

		return getValueAtPath(baseline, parsedPath);
	}

	function updateSemanticFieldFingerprint(fingerprint: SemanticFieldFingerprint) {
		const parsedPath = parseFieldPath(fingerprint.path);
		if (parsedPath.length === 0) {
			return;
		}

		const pathKey = getPathKey(parsedPath);
		const nextFingerprint: StoredSemanticFieldFingerprint = {
			...fingerprint,
			parsedPath,
			pathKey
		};
		const previousFingerprint = semanticFieldFingerprints.get(pathKey);
		if (getFingerprint(previousFingerprint) === getFingerprint(nextFingerprint)) {
			return;
		}

		semanticFieldFingerprints = new Map(semanticFieldFingerprints).set(pathKey, nextFingerprint);
		notify();
	}

	function openPanel(panel: OpenPanelInput) {
		const normalizedPanel = {
			...panel,
			targetPath: [...panel.targetPath],
			itemFieldPath: panel.itemFieldPath,
			...(panel.kind === 'repeatable'
				? {
						arrayPath: [...panel.arrayPath],
						selectedIndex: panel.selectedIndex
					}
				: {}),
			selectedItem: cloneContentRecord(panel.selectedItem),
			draftItem: cloneContentRecord(panel.selectedItem),
			initialItem: cloneContentRecord(panel.selectedItem)
		} as PanelEntry;

		const active = getActiveEntry();
		if (!active) {
			panelStack = [normalizedPanel];
			notify();
			return;
		}

		const nested = isNestedPanel(active, normalizedPanel);
		if (!nested && active.mode === 'edit' && isPanelDirty(active, semanticFieldFingerprints)) {
			commitEntry(active);
		}

		panelStack = nested ? [...panelStack, normalizedPanel] : [normalizedPanel];
		notify();
	}

	function updatePanelField(blockId: string, value: ContentValue | undefined) {
		const active = getActiveEntry();
		if (!active) {
			return;
		}

		active.draftItem = {
			...active.draftItem,
			[blockId]: value
		};
		if (active.kind === 'repeatable' && active.mode === 'edit') {
			active.title = getRepeatableItemLabel(
				active.draftItem,
				active.selectedIndex,
				active.blocks,
				active.label
			);
		}
		active.submitError = undefined;
		notify();
	}

	function reorderArrayItems(
		arrayPath: ContentPath,
		nextItems: ContentValue[],
		indexMap: Map<number, number> = new Map()
	) {
		const active = getActiveEntry();
		const parent = active && pathStartsWith(arrayPath, active.targetPath) ? active : null;

		if (parent) {
			parent.draftItem = setValueAtPath(
				parent.draftItem,
				arrayPath.slice(parent.targetPath.length),
				nextItems
			) as ContentRecord;
		} else {
			data = setValueAtPath(data, arrayPath, nextItems) as ContentRecord;
		}

		for (const panel of panelStack) {
			if (panel.kind === 'repeatable' && pathsEqual(panel.arrayPath, arrayPath)) {
				panel.selectedIndex = indexMap.get(panel.selectedIndex) ?? panel.selectedIndex;
			}
		}

		notify();
	}

	function commitPanel() {
		const active = getActiveEntry();
		if (!active || !isPanelDirty(active, semanticFieldFingerprints)) {
			return;
		}

		commitEntry(active);
		panelStack = panelStack.slice(0, -1);
		notify();
	}

	function closePanel() {
		const active = getActiveEntry();
		if (!active) {
			return;
		}

		if (active.mode === 'edit' && isPanelDirty(active, semanticFieldFingerprints)) {
			commitEntry(active);
		}

		panelStack = panelStack.slice(0, -1);
		notify();
	}

	function discardPanel() {
		if (panelStack.length === 0) {
			return;
		}

		panelStack = panelStack.slice(0, -1);
		notify();
	}

	function removePanelItem() {
		const active = getActiveEntry();
		if (!active || active.kind !== 'repeatable' || active.mode !== 'edit') {
			return;
		}

		const nextItems = getCurrentArrayForEntry(active).filter(
			(_, index) => index !== active.selectedIndex
		);
		applyValueForEntry(active, nextItems);
		panelStack = panelStack.slice(0, -1);
		notify();
	}

	function prepareSubmit(): PrepareSubmitResult {
		const active = getActiveEntry();
		if (active?.mode === 'create' && isPanelDirty(active, semanticFieldFingerprints)) {
			active.submitError = `Add ${active.title} or cancel before saving the page.`;
			notify();
			return {
				ok: false,
				data,
				message: active.submitError
			};
		}

		while (panelStack.length > 0) {
			const nextActive = getActiveEntry();
			if (nextActive?.mode === 'edit' && isPanelDirty(nextActive, semanticFieldFingerprints)) {
				commitEntry(nextActive);
			}
			panelStack = panelStack.slice(0, -1);
		}

		notify();
		return {
			ok: true,
			data: getSubmissionData()
		};
	}

	function markSaved(nextData: ContentRecord = data) {
		data = cloneContentRecord(nextData);
		baseline = cloneContentRecord(nextData);
		panelStack = [];
		semanticFieldFingerprints = new Map(
			[...semanticFieldFingerprints].map(([key, fingerprint]) => [
				key,
				{
					...fingerprint,
					baselineFingerprint: fingerprint.currentFingerprint
				}
			])
		);
		notify();
	}

	function exportRecoveryState(): FormEditSessionRecoveryState {
		return {
			data: cloneContentRecord(data),
			baseline: cloneContentRecord(baseline),
			panelStack: panelStack.map(toRecoveryPanel)
		};
	}

	function restoreRecoveryState(
		state: FormEditSessionRecoveryState,
		runtime: Pick<BasePanelInput, 'blockRegistry' | 'navigationManifest' | 'onaddselectoption'>
	) {
		data = cloneContentRecord(state.data);
		baseline = cloneContentRecord(state.baseline);
		panelStack = state.panelStack.map((panel) => fromRecoveryPanel(panel, runtime));
		notify();
	}

	function destroy() {
		panelStack = [];
		options.onPanelChange?.(null);
	}

	function commitEntry(entry: PanelEntry) {
		const nextItem = preserveSemanticallyCleanFields(
			entry.draftItem,
			entry.initialItem,
			entry.targetPath
		);
		if (entry.kind === 'object') {
			applyValueForEntry(entry, nextItem);
			entry.initialItem = nextItem;
			entry.draftItem = cloneContentRecord(nextItem);
			entry.submitError = undefined;
			return;
		}

		const currentItems = getCurrentArrayForEntry(entry);
		const nextItems =
			entry.mode === 'create'
				? [
						...currentItems.slice(0, entry.selectedIndex),
						nextItem,
						...currentItems.slice(entry.selectedIndex)
					]
				: currentItems.map((item, index) => (index === entry.selectedIndex ? nextItem : item));

		applyValueForEntry(entry, nextItems);
		entry.initialItem = nextItem;
		entry.draftItem = cloneContentRecord(nextItem);
		entry.submitError = undefined;
	}

	function getSubmissionData(): ContentRecord {
		return preserveSemanticallyCleanFields(data, baseline, []);
	}

	function preserveSemanticallyCleanFields(
		current: ContentRecord,
		initial: ContentRecord,
		basePath: ContentPath
	): ContentRecord {
		return preserveSemanticallyCleanFieldsForMap(
			current,
			initial,
			basePath,
			semanticFieldFingerprints
		);
	}

	function getCurrentArrayForEntry(
		entry: Extract<PanelEntry, { kind: 'repeatable' }>
	): ContentValue[] {
		const parent = getParentEntry(entry);
		const source = parent ? parent.draftItem : data;
		const path = parent ? getRelativePath(parent, entry.arrayPath) : entry.arrayPath;
		const value = getValueAtPath(source, path);
		return Array.isArray(value) ? value : [];
	}

	function applyValueForEntry(entry: PanelEntry, nextValue: ContentValue) {
		const parent = getParentEntry(entry);
		const path = parent
			? getRelativePath(parent, entry.kind === 'repeatable' ? entry.arrayPath : entry.targetPath)
			: entry.kind === 'repeatable'
				? entry.arrayPath
				: entry.targetPath;

		if (parent) {
			parent.draftItem = setValueAtPath(parent.draftItem, path, nextValue) as ContentRecord;
			return;
		}

		data = setValueAtPath(data, path, nextValue) as ContentRecord;
	}

	function getParentEntry(entry: PanelEntry): PanelEntry | null {
		const index = panelStack.indexOf(entry);
		return index > 0 ? (panelStack[index - 1] ?? null) : null;
	}

	return {
		getData: () => data,
		setData,
		updateData,
		getBaselineFieldValue,
		updateSemanticFieldFingerprint,
		getDirtyState,
		getActivePanel,
		openPanel,
		updatePanelField,
		reorderArrayItems,
		commitPanel,
		closePanel,
		discardPanel,
		removePanelItem,
		prepareSubmit,
		markSaved,
		exportRecoveryState,
		restoreRecoveryState,
		destroy
	};
}

export function parseFieldPath(path: string): ContentPath {
	const segments: ContentPath = [];
	const pattern = /([^[.\]]+)|\[(\d+)\]/g;
	let match: RegExpExecArray | null;

	while ((match = pattern.exec(path)) !== null) {
		if (match[1] !== undefined) {
			segments.push(match[1]);
		} else if (match[2] !== undefined) {
			segments.push(Number(match[2]));
		}
	}

	return segments;
}

export function cloneContentRecord(item: ContentRecord): ContentRecord {
	try {
		return structuredClone(item) as ContentRecord;
	} catch {
		return JSON.parse(JSON.stringify(item)) as ContentRecord;
	}
}

function cloneContentValue<T extends ContentValue | ContentRecord | undefined>(value: T): T {
	if (value === undefined) {
		return value;
	}

	try {
		return structuredClone(value) as T;
	} catch {
		return JSON.parse(JSON.stringify(value)) as T;
	}
}

function toPanelView(
	entry: PanelEntry,
	parent: PanelEntry | null,
	semanticFingerprints: Map<string, StoredSemanticFieldFingerprint>
): FormPanelView {
	const { draftItem, initialItem, submitError, ...panel } = entry;
	return {
		...panel,
		selectedItem: draftItem,
		isDirty: isPanelDirty(entry, semanticFingerprints),
		submitError,
		hasParentPanel: parent !== null,
		parentPanelTitle: parent?.title
	};
}

function toRecoveryPanel(entry: PanelEntry): FormEditSessionRecoveryPanel {
	return {
		id: entry.id,
		kind: entry.kind,
		mode: entry.mode,
		label: entry.label,
		listLabel: entry.listLabel,
		title: entry.title,
		blocks: entry.blocks,
		editorLayout: entry.editorLayout,
		selectedItem: cloneContentRecord(entry.selectedItem),
		targetPath: [...entry.targetPath],
		itemFieldPath: entry.itemFieldPath,
		imagePath: entry.imagePath,
		configPath: entry.configPath,
		defaultAssetStoragePath: entry.defaultAssetStoragePath,
		selectedIndex: entry.kind === 'repeatable' ? entry.selectedIndex : undefined,
		arrayPath: entry.kind === 'repeatable' ? [...entry.arrayPath] : undefined,
		draftItem: cloneContentRecord(entry.draftItem),
		initialItem: cloneContentRecord(entry.initialItem),
		submitError: entry.submitError
	};
}

function fromRecoveryPanel(
	panel: FormEditSessionRecoveryPanel,
	runtime: Pick<BasePanelInput, 'blockRegistry' | 'navigationManifest' | 'onaddselectoption'>
): PanelEntry {
	const basePanel = {
		id: panel.id,
		kind: panel.kind,
		mode: panel.mode,
		label: panel.label,
		listLabel: panel.listLabel,
		title: panel.title,
		blocks: panel.blocks,
		editorLayout: panel.editorLayout,
		selectedItem: cloneContentRecord(panel.selectedItem),
		targetPath: [...panel.targetPath],
		itemFieldPath: panel.itemFieldPath,
		imagePath: panel.imagePath,
		configPath: panel.configPath,
		defaultAssetStoragePath: panel.defaultAssetStoragePath,
		blockRegistry: runtime.blockRegistry,
		navigationManifest: runtime.navigationManifest,
		onaddselectoption: runtime.onaddselectoption,
		draftItem: cloneContentRecord(panel.draftItem),
		initialItem: cloneContentRecord(panel.initialItem),
		submitError: panel.submitError
	};

	if (panel.kind === 'repeatable') {
		return {
			...basePanel,
			kind: 'repeatable',
			selectedIndex: panel.selectedIndex ?? 0,
			arrayPath: [...(panel.arrayPath ?? [])]
		};
	}

	return {
		...basePanel,
		kind: 'object'
	};
}

function isPanelDirty(
	panel: PanelEntry,
	semanticFingerprints: Map<string, StoredSemanticFieldFingerprint>
): boolean {
	return (
		getFingerprint(panel.draftItem, panel.targetPath, 'current', semanticFingerprints) !==
		getFingerprint(panel.initialItem, panel.targetPath, 'baseline', semanticFingerprints)
	);
}

function getPathKey(path: ContentPath): string {
	return JSON.stringify(path);
}

function getFingerprint(
	value: unknown,
	basePath: ContentPath = [],
	side: SemanticFingerprintSide = 'current',
	semanticFingerprints: Map<string, StoredSemanticFieldFingerprint> = new Map()
): string {
	return JSON.stringify(getComparableValue(value, basePath, side, semanticFingerprints));
}

function getComparableValue(
	value: unknown,
	basePath: ContentPath,
	side: SemanticFingerprintSide,
	semanticFingerprints: Map<string, StoredSemanticFieldFingerprint> = new Map()
): unknown {
	const semanticFingerprint = semanticFingerprints.get(getPathKey(basePath));
	if (semanticFingerprint) {
		return {
			_tentmanSemanticKind: semanticFingerprint.kind,
			fingerprint:
				side === 'baseline'
					? semanticFingerprint.baselineFingerprint
					: semanticFingerprint.currentFingerprint
		};
	}

	if (Array.isArray(value)) {
		return value.map((item, index) =>
			getComparableValue(item, [...basePath, index], side, semanticFingerprints)
		);
	}

	if (value && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value).map(([key, childValue]) => [
				key,
				getComparableValue(childValue, [...basePath, key], side, semanticFingerprints)
			])
		);
	}

	return value;
}

function preserveSemanticallyCleanFieldsForMap(
	current: ContentRecord,
	baseline: ContentRecord,
	basePath: ContentPath,
	semanticFingerprints: Map<string, StoredSemanticFieldFingerprint>
): ContentRecord {
	let next = cloneContentRecord(current);

	for (const fingerprint of semanticFingerprints.values()) {
		if (
			!pathStartsWith(fingerprint.parsedPath, basePath) ||
			fingerprint.baselineFingerprint !== fingerprint.currentFingerprint
		) {
			continue;
		}

		const relativePath = fingerprint.parsedPath.slice(basePath.length);
		if (relativePath.length === 0) {
			continue;
		}

		const baselineValue = getValueAtPath(baseline, relativePath);
		next = setValueAtPath(next, relativePath, baselineValue as ContentValue) as ContentRecord;
	}

	return next;
}

function isNestedPanel(parent: PanelEntry, child: PanelEntry): boolean {
	return pathStartsWith(child.targetPath, parent.targetPath);
}

function pathStartsWith(path: ContentPath, prefix: ContentPath): boolean {
	return prefix.every((segment, index) => path[index] === segment);
}

function pathsEqual(left: ContentPath, right: ContentPath): boolean {
	return left.length === right.length && left.every((segment, index) => right[index] === segment);
}

function getRelativePath(parent: PanelEntry, childPath: ContentPath): ContentPath {
	return childPath.slice(parent.targetPath.length);
}

function getValueAtPath(source: ContentRecord, path: ContentPath): ContentValue | undefined {
	let current: unknown = source;

	for (const segment of path) {
		if (!current || typeof current !== 'object') {
			return undefined;
		}
		current = (current as Record<string | number, ContentValue | undefined>)[segment];
	}

	return current as ContentValue | undefined;
}

function setValueAtPath(
	source: ContentRecord | ContentValue[],
	path: ContentPath,
	value: ContentValue
): ContentRecord | ContentValue[] {
	if (path.length === 0) {
		return cloneContentValue(value) as ContentRecord | ContentValue[];
	}

	const [segment, ...rest] = path;
	const clone = Array.isArray(source) ? [...source] : { ...source };

	if (rest.length === 0) {
		(clone as Record<string | number, ContentValue>)[segment] = cloneContentValue(
			value
		) as ContentValue;
		return clone;
	}

	const current = (clone as Record<string | number, ContentValue | undefined>)[segment];
	const nextSource =
		current && typeof current === 'object'
			? (current as ContentRecord | ContentValue[])
			: typeof rest[0] === 'number'
				? []
				: {};

	(clone as Record<string | number, ContentValue>)[segment] = setValueAtPath(
		nextSource,
		rest,
		value
	) as ContentValue;

	return clone;
}
