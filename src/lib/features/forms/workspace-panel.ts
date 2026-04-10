import type { Writable } from 'svelte/store';

export const FORM_WORKSPACE_PANEL = Symbol('form-workspace-panel');

export interface FormWorkspacePanelContext {
	activePanelId: Writable<string | null>;
	setActivePanel: (panelId: string | null) => void;
}
