import type { BlockRegistry } from '$lib/blocks/registry';
import type { BlockUsage } from '$lib/config/types';
import type { NavigationManifest } from '$lib/features/content-management/navigation-manifest';
import type { ContentRecord, ContentValue } from '$lib/features/content-management/types';

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
	selectedItem: ContentRecord;
	targetPath: ContentPath;
	itemFieldPath?: string;
	imagePath?: string;
	blockRegistry: BlockRegistry;
	navigationManifest?: NavigationManifest | null;
	onaddselectoption?: (input: { collection: string; id: string; label: string }) => Promise<void>;
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

export type PrepareSubmitResult =
	| { ok: true; data: ContentRecord }
	| { ok: false; data: ContentRecord; message: string };

type PanelEntry = (OpenRepeatablePanelInput | OpenObjectPanelInput) & {
	draftItem: ContentRecord;
	initialItem: ContentRecord;
	submitError?: string;
};

interface FormEditSessionOptions {
	onChange?: (state: FormDirtyState) => void;
	onPanelChange?: (panel: FormPanelView | null) => void;
}

export interface FormEditSession {
	getData: () => ContentRecord;
	setData: (data: ContentRecord) => void;
	updateData: (data: ContentRecord) => void;
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
	destroy: () => void;
}

export function createFormEditSession(
	initialData: ContentRecord,
	options: FormEditSessionOptions = {}
): FormEditSession {
	let data = cloneContentRecord(initialData);
	let baseline = cloneContentRecord(initialData);
	let panelStack: PanelEntry[] = [];

	function getDirtyState(): FormDirtyState {
		return {
			isDirty: getFingerprint(data) !== getFingerprint(baseline) || panelStack.some(isPanelDirty),
			hasPanelDraft: panelStack.some(isPanelDirty),
			hasCreatePanelDraft: panelStack.some(
				(panel) => panel.mode === 'create' && isPanelDirty(panel)
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

		return toPanelView(active, getParentEntry(active));
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
		if (!nested && active.mode === 'edit' && isPanelDirty(active)) {
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
		if (!active || !isPanelDirty(active)) {
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

		if (active.mode === 'edit' && isPanelDirty(active)) {
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
		if (active?.mode === 'create' && isPanelDirty(active)) {
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
			if (nextActive?.mode === 'edit' && isPanelDirty(nextActive)) {
				commitEntry(nextActive);
			}
			panelStack = panelStack.slice(0, -1);
		}

		notify();
		return {
			ok: true,
			data
		};
	}

	function markSaved(nextData: ContentRecord = data) {
		data = cloneContentRecord(nextData);
		baseline = cloneContentRecord(nextData);
		panelStack = [];
		notify();
	}

	function destroy() {
		panelStack = [];
		options.onPanelChange?.(null);
	}

	function commitEntry(entry: PanelEntry) {
		const nextItem = cloneContentRecord(entry.draftItem);
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
			? getRelativePath(
					parent,
					entry.kind === 'repeatable' ? entry.arrayPath : entry.targetPath
				)
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

function toPanelView(entry: PanelEntry, parent: PanelEntry | null): FormPanelView {
	const { draftItem, initialItem, submitError, ...panel } = entry;
	return {
		...panel,
		selectedItem: draftItem,
		isDirty: isPanelDirty(entry),
		submitError,
		hasParentPanel: parent !== null,
		parentPanelTitle: parent?.title
	};
}

function isPanelDirty(panel: PanelEntry): boolean {
	return getFingerprint(panel.draftItem) !== getFingerprint(panel.initialItem);
}

function getFingerprint(value: unknown): string {
	return JSON.stringify(value);
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
