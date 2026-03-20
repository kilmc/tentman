import { describe, expect, it, vi } from 'vitest';
import { loadJavaScriptModuleFromText } from '$lib/repository/local';

describe('loadJavaScriptModuleFromText', () => {
	it('imports module source through a blob url and revokes the url afterward', async () => {
		const createObjectURL = vi.fn().mockReturnValue('blob:tentman-test');
		const revokeObjectURL = vi.fn();
		const importModule = vi.fn().mockResolvedValue({
			adapter: {
				type: 'gallery',
				getDefaultValue() {
					return [];
				}
			}
		});

		const moduleValue = await loadJavaScriptModuleFromText(
			'export const adapter = { type: "gallery" };',
			'tentman/blocks/gallery.adapter.js',
			{
				createObjectURL,
				revokeObjectURL,
				importModule
			}
		);

		expect(moduleValue).toMatchObject({
			adapter: {
				type: 'gallery'
			}
		});
		expect(createObjectURL).toHaveBeenCalledOnce();
		expect(importModule).toHaveBeenCalledWith('blob:tentman-test');
		expect(revokeObjectURL).toHaveBeenCalledWith('blob:tentman-test');

		const moduleBlob = createObjectURL.mock.calls[0]?.[0];
		expect(moduleBlob).toBeInstanceOf(Blob);
		await expect(moduleBlob.text()).resolves.toContain('//# sourceURL=tentman/blocks/gallery.adapter.js');
	});
});
