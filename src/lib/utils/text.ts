function createBufferLike(value: string) {
	return {
		toString() {
			return value;
		},
		valueOf() {
			return value;
		}
	};
}

export function ensureBufferGlobal(): void {
	if (typeof Buffer !== 'undefined') {
		return;
	}

	const encoder = new TextEncoder();

	Object.defineProperty(globalThis, 'Buffer', {
		value: {
			from(input: string) {
				return createBufferLike(String(input));
			},
			byteLength(input: string) {
				return encoder.encode(String(input)).length;
			}
		},
		configurable: true,
		writable: true
	});
}

export function getUtf8ByteLength(value: string): number {
	if (typeof Buffer !== 'undefined') {
		return Buffer.byteLength(value, 'utf-8');
	}

	return new TextEncoder().encode(value).length;
}

export function decodeBase64ToUtf8(value: string): string {
	if (typeof Buffer !== 'undefined') {
		return Buffer.from(value, 'base64').toString('utf-8');
	}

	const binary = atob(value);
	const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
	return new TextDecoder().decode(bytes);
}
