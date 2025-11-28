/**
 * Error handling utilities for GitHub API and application errors
 */

export interface AppError {
	message: string;
	code?: string;
	details?: string;
	userFriendly: string;
}

/**
 * Parse GitHub API errors into user-friendly messages
 */
export function parseGitHubError(error: unknown): AppError {
	// Handle Octokit RequestError
	if (error && typeof error === 'object' && 'status' in error) {
		const status = (error as any).status;
		const message = (error as any).message || '';

		switch (status) {
			case 401:
				return {
					message,
					code: 'UNAUTHORIZED',
					userFriendly: 'Authentication failed. Please log in again.'
				};
			case 403:
				if (message.toLowerCase().includes('rate limit')) {
					return {
						message,
						code: 'RATE_LIMIT',
						userFriendly:
							'GitHub API rate limit exceeded. Please wait a few minutes and try again.'
					};
				}
				return {
					message,
					code: 'FORBIDDEN',
					userFriendly: "You don't have permission to access this resource."
				};
			case 404:
				return {
					message,
					code: 'NOT_FOUND',
					userFriendly: 'The requested file or resource was not found in the repository.'
				};
			case 409:
				return {
					message,
					code: 'CONFLICT',
					userFriendly:
						'There was a conflict saving your changes. The file may have been modified elsewhere.'
				};
			case 422:
				return {
					message,
					code: 'VALIDATION_ERROR',
					userFriendly: 'The data provided was invalid. Please check your input and try again.'
				};
			default:
				return {
					message,
					code: `HTTP_${status}`,
					userFriendly: `An error occurred while communicating with GitHub (Error ${status})`
				};
		}
	}

	// Handle validation errors
	if (error instanceof Error) {
		if (error.message.includes('required')) {
			return {
				message: error.message,
				code: 'VALIDATION_ERROR',
				userFriendly: 'Please fill in all required fields.'
			};
		}
		if (error.message.includes('unique') || error.message.includes('already exists')) {
			return {
				message: error.message,
				code: 'DUPLICATE_ERROR',
				userFriendly: 'An item with this identifier already exists.'
			};
		}
	}

	// Generic error
	const message = error instanceof Error ? error.message : 'Unknown error';
	return {
		message,
		code: 'UNKNOWN',
		userFriendly: message || 'An unexpected error occurred. Please try again.'
	};
}

/**
 * Format error for display to users
 */
export function formatErrorMessage(error: unknown): string {
	const parsed = parseGitHubError(error);
	return parsed.userFriendly;
}

/**
 * Log error for debugging (can be extended to send to error tracking service)
 */
export function logError(error: unknown, context?: string) {
	const parsed = parseGitHubError(error);
	console.error(`[Error${context ? ` - ${context}` : ''}]:`, {
		userMessage: parsed.userFriendly,
		technical: parsed.message,
		code: parsed.code,
		original: error
	});
}
