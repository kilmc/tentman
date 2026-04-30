import { checkAssetDirectories } from './diagnostics.js';
import { collectTentmanConfigAssets } from './assets.js';

function createDiagnostic(level, code, message, details = {}) {
	return { level, code, message, ...details };
}

export async function checkTentmanAssets(project) {
	const diagnostics = [...(await checkAssetDirectories(project))];

	for (const config of project.configs) {
		const assets = await collectTentmanConfigAssets(project, config);

		for (const asset of assets.assets) {
			if (asset.matchesExpectedPath === false) {
				diagnostics.push(
					createDiagnostic(
						'error',
						'assets.path-mismatch',
						`${asset.configLabel} item ${asset.itemLabel} field ${asset.fieldPath} uses ${asset.value}, but expected a path under ${asset.expectedPrefix ?? asset.assetsDir}`,
						{
							path: asset.contentPath,
							configPath: asset.configPath,
							fieldPath: asset.fieldPath,
							value: asset.value
						}
					)
				);
				continue;
			}

			if (asset.matchesExpectedPath === true && asset.exists === false) {
				diagnostics.push(
					createDiagnostic(
						'error',
						'assets.missing-file',
						`${asset.configLabel} item ${asset.itemLabel} field ${asset.fieldPath} references missing asset ${asset.value}`,
						{
							path: asset.contentPath,
							configPath: asset.configPath,
							fieldPath: asset.fieldPath,
							value: asset.value
						}
					)
				);
			}
		}
	}

	return diagnostics;
}
