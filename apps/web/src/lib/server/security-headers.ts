export function buildSecurityHeaders(): Record<string, string> {
	return {
		'Content-Security-Policy': [
			"default-src 'self'",
			"base-uri 'self'",
			"frame-ancestors 'none'",
			"frame-src 'self' https://app.netlify.com",
			"form-action 'self' https://github.com",
			"img-src 'self' data: blob: https:",
			"media-src 'self' blob: https:",
			"script-src 'self' 'unsafe-inline'",
			"style-src 'self' 'unsafe-inline'",
			"connect-src 'self' https://api.github.com https://github.com ws: wss:",
			"object-src 'none'"
		].join('; '),
		'Referrer-Policy': 'strict-origin-when-cross-origin',
		'X-Content-Type-Options': 'nosniff',
		'X-Frame-Options': 'DENY'
	};
}
