import type { Writable } from 'svelte/store';
import type { BlockRegistry } from '$lib/blocks/registry';
import type { BlockUsage } from '$lib/config/types';
import type { ContentRecord } from '$lib/features/content-management/types';

export const FORM_WORKSPACE_PANEL = Symbol('form-workspace-panel');

export interface RepeatableWorkspacePanel {
	id: string;
	mode: 'create' | 'edit';
	label: string;
	listLabel: string;
	title: string;
	blocks: BlockUsage[];
	selectedIndex: number;
	selectedItem: ContentRecord;
	previousPanel?: RepeatableWorkspacePanel | null;
	fieldPath?: string;
	imagePath?: string;
	blockRegistry: BlockRegistry;
	close: () => void;
	remove?: () => void;
	save: (item: ContentRecord) => void;
}

export interface FormWorkspacePanelContext {
	activePanel: Writable<RepeatableWorkspacePanel | null>;
	setActivePanel: (panel: RepeatableWorkspacePanel | null) => void;
}
