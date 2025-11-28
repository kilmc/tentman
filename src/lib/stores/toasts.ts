import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration: number;
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	return {
		subscribe,
		add: (message: string, type: ToastType = 'info', duration = 3000) => {
			const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
			update((toasts) => [...toasts, { id, message, type, duration }]);
			return id;
		},
		remove: (id: string) => {
			update((toasts) => toasts.filter((t) => t.id !== id));
		},
		success: (message: string, duration = 3000) => {
			return createToastStore().add(message, 'success', duration);
		},
		error: (message: string, duration = 5000) => {
			return createToastStore().add(message, 'error', duration);
		},
		warning: (message: string, duration = 4000) => {
			return createToastStore().add(message, 'warning', duration);
		},
		info: (message: string, duration = 3000) => {
			return createToastStore().add(message, 'info', duration);
		}
	};
}

export const toasts = createToastStore();
