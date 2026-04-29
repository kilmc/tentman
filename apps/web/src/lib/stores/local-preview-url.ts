import { writable } from 'svelte/store';

const store = writable<string | null>(null);

export const localPreviewUrl = {
	subscribe: store.subscribe,
	set(value: string | null) {
		store.set(value);
	}
};
