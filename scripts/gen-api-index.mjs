#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const API_DIR = "docs/api";

/**
 * Capitalizes the first letter of a string.
 */
function capitalize(str) {
	return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Validates that the API directory exists.
 */
function validateApiDirectory() {
	if (!fs.existsSync(API_DIR)) {
		console.error(`Error: API directory '${API_DIR}' does not exist.`);
		console.error("Run 'pnpm docs:typedoc && pnpm docs:copy-api' first.");
		process.exit(1);
	}

	const stats = fs.statSync(API_DIR);
	if (!stats.isDirectory()) {
		console.error(`Error: '${API_DIR}' exists but is not a directory.`);
		process.exit(1);
	}
}

/**
 * Gets all subdirectories in the API directory.
 */
function getSubdirectories() {
	const entries = fs.readdirSync(API_DIR, { withFileTypes: true });
	return entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name);
}

/**
 * Gets all markdown files in a subdirectory.
 */
function getMarkdownFiles(subdirName) {
	const subdirPath = path.join(API_DIR, subdirName);
	const entries = fs.readdirSync(subdirPath);
	return entries.filter((entry) => entry.endsWith(".md"));
}

/**
 * Generates an index file for a subdirectory.
 */
function generateIndex(subdirName, mdFiles) {
	const indexPath = path.join(API_DIR, `${subdirName}.md`);
	let content = `# ${capitalize(subdirName)}\n\n`;

	mdFiles.forEach((file) => {
		const name = file.replace(/\.md$/, "");
		content += `- [${name}](${subdirName}/${name}.md)\n`;
	});

	fs.writeFileSync(indexPath, content);
	console.log(`Generated index for ${subdirName} (${mdFiles.length} entries)`);
}

/**
 * Main entry point.
 */
function main() {
	validateApiDirectory();

	const subdirs = getSubdirectories();
	if (subdirs.length === 0) {
		console.error(`Error: No subdirectories found in '${API_DIR}'.`);
		console.error("Run 'pnpm docs:typedoc && pnpm docs:copy-api' first.");
		process.exit(1);
	}

	let generatedCount = 0;

	subdirs.forEach((subdir) => {
		const mdFiles = getMarkdownFiles(subdir);
		if (mdFiles.length === 0) {
			console.log(`Skipping ${subdir} (no markdown files)`);
			return;
		}

		generateIndex(subdir, mdFiles);
		generatedCount++;
	});

	if (generatedCount === 0) {
		console.error("\nError: No markdown files found in any subdirectory.");
		process.exit(1);
	}

	console.log(`\nIndex generation completed successfully (${generatedCount} indices).`);
}

main();
