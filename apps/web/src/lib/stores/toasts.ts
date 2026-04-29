import { writable } from 'svelte/store';

export type ToastType = 'success' | 'error' | 'info' | 'warning';

export interface ToastAction {
	label: string;
	callback: () => void;
}

export interface Toast {
	id: string;
	message: string;
	type: ToastType;
	duration: number;
	action?: ToastAction;
}

function createToastStore() {
	const { subscribe, update } = writable<Toast[]>([]);

	const store = {
		subscribe,
		add: (message: string, type: ToastType = 'info', duration = 3000, action?: ToastAction) => {
			const id = `toast-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
			update((toasts) => [...toasts, { id, message, type, duration, action }]);
			return id;
		},
		remove: (id: string) => {
			update((toasts) => toasts.filter((t) => t.id !== id));
		},
		success: (message: string, duration = 3000, action?: ToastAction) => {
			return store.add(message, 'success', duration, action);
		},
		error: (message: string, duration = 5000, action?: ToastAction) => {
			return store.add(message, 'error', duration, action);
		},
		warning: (message: string, duration = 4000, action?: ToastAction) => {
			return store.add(message, 'warning', duration, action);
		},
		info: (message: string, duration = 3000, action?: ToastAction) => {
			return store.add(message, 'info', duration, action);
		}
	};

	return store;
}

export const toasts = createToastStore();
