export type EditorSaveStatus = 'saved' | 'saving' | 'unsaved' | 'failed' | 'not-saved';

export function getEditorSaveStatusMeta(status: EditorSaveStatus): {
	label: string;
	className: string;
} {
	switch (status) {
		case 'saving':
			return {
				label: 'Saving...',
				className: 'border-blue-200 bg-blue-50 text-blue-800'
			};
		case 'unsaved':
			return {
				label: 'Unsaved changes',
				className: 'border-amber-200 bg-amber-50 text-amber-800'
			};
		case 'failed':
			return {
				label: 'Save failed',
				className: 'border-red-200 bg-red-50 text-red-800'
			};
		case 'not-saved':
			return {
				label: 'Not saved yet',
				className: 'border-stone-200 bg-stone-100 text-stone-700'
			};
		case 'saved':
		default:
			return {
				label: 'Saved',
				className: 'border-emerald-200 bg-emerald-50 text-emerald-800'
			};
	}
}

export function shouldShowEditorSaveStatus(status: EditorSaveStatus): boolean {
	return status === 'saving' || status === 'unsaved' || status === 'failed';
}
