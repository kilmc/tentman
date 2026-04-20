import { beforeNavigate } from '$app/navigation';
import { onMount } from 'svelte';

interface UnsavedChangesGuardOptions {
	hasUnsavedChanges: () => boolean;
	isSaving: () => boolean;
	message?: string;
}

const DEFAULT_UNSAVED_MESSAGE = 'You have unsaved changes. Are you sure you want to leave?';

export function registerUnsavedChangesGuard({
	hasUnsavedChanges,
	isSaving,
	message = DEFAULT_UNSAVED_MESSAGE
}: UnsavedChangesGuardOptions): void {
	function shouldBlockNavigation() {
		return hasUnsavedChanges() && !isSaving();
	}

	beforeNavigate(({ cancel }) => {
		if (shouldBlockNavigation() && !confirm(message)) {
			cancel();
		}
	});

	onMount(() => {
		function handleBeforeUnload(event: BeforeUnloadEvent) {
			if (!shouldBlockNavigation()) {
				return;
			}

			event.preventDefault();
			event.returnValue = '';
		}

		window.addEventListener('beforeunload', handleBeforeUnload);
		return () => window.removeEventListener('beforeunload', handleBeforeUnload);
	});
}
