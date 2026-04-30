import { checkNavigationManifest, checkTentmanIds, doctorTentmanProject } from './diagnostics.js';
import { checkTentmanFormat, summarizeFormatCheck } from './format-check.js';

function countDiagnostics(diagnostics) {
	return {
		errors: diagnostics.filter((diagnostic) => diagnostic.level === 'error').length,
		warnings: diagnostics.filter((diagnostic) => diagnostic.level === 'warning').length
	};
}

export async function runTentmanCi(project) {
	const doctorDiagnostics = await doctorTentmanProject(project);
	const idDiagnostics = checkTentmanIds(project);
	const navigationDiagnostics = checkNavigationManifest(project);
	const rewrites = await checkTentmanFormat(project);
	const formatSummary = summarizeFormatCheck(rewrites);

	const checks = [
		{
			id: 'doctor',
			title: 'Tentman doctor',
			diagnostics: doctorDiagnostics,
			...countDiagnostics(doctorDiagnostics)
		},
		{
			id: 'ids',
			title: 'Tentman ids check',
			diagnostics: idDiagnostics,
			...countDiagnostics(idDiagnostics)
		},
		{
			id: 'nav',
			title: 'Tentman nav check',
			diagnostics: navigationDiagnostics,
			...countDiagnostics(navigationDiagnostics)
		},
		{
			id: 'format',
			title: 'Tentman format --check',
			rewrites,
			summary: formatSummary,
			errors: rewrites.length > 0 ? rewrites.length : 0,
			warnings: 0
		}
	];

	const summary = {
		errors: checks.reduce((total, check) => total + check.errors, 0),
		warnings: checks.reduce((total, check) => total + check.warnings, 0),
		failedChecks: checks.filter((check) => check.errors > 0).map((check) => check.id),
		checks: checks.length
	};

	return {
		checks,
		summary
	};
}
