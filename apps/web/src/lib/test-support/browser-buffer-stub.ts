const browserBufferFallback = {
	from(input: string | ArrayLike<number>) {
		if (typeof input === 'string') {
			return new TextEncoder().encode(input);
		}

		return new Uint8Array(Array.from(input));
	},
	isBuffer(value: unknown): value is Uint8Array {
		return value instanceof Uint8Array;
	}
};

export const Buffer: {
	from(input: string | ArrayLike<number>): Uint8Array;
	isBuffer(value: unknown): value is Uint8Array;
} = globalThis.Buffer ?? browserBufferFallback;

export default {
	Buffer
};
