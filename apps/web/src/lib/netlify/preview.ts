/**
 * Generates a Netlify deploy preview URL for a given branch and site.
 *
 * Netlify's preview URL pattern is: https://{branch}--{siteName}.netlify.app
 * where the branch name is normalized to be URL-safe.
 *
 * @param branchName - Git branch name (e.g., "preview/user123-1234567890")
 * @param siteName - Netlify site name from .tentman.json config
 * @returns Full Netlify preview URL
 *
 * @example
 * getNetlifyPreviewUrl('preview/user123-1234567890', 'my-site')
 * // Returns: 'https://preview-user123-1234567890--my-site.netlify.app'
 */
export function getNetlifyPreviewUrl(branchName: string, siteName: string): string {
	// Convert branch name to URL-safe format
	// Replace forward slashes and underscores with hyphens
	const urlSafeBranch = branchName.replace(/[/_]/g, '-');

	return `https://${urlSafeBranch}--${siteName}.netlify.app`;
}
