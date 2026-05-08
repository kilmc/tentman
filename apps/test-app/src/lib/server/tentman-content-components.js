// @ts-nocheck

import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

let apiPromise;

export async function getTentmanContentComponentApi() {
	apiPromise ??= import(
		/* @vite-ignore */ pathToFileURL(resolve(process.cwd(), '../../packages/core/src/index.js')).href
	);
	return apiPromise;
}
