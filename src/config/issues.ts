// Turn zod's issues into the `path: message` pairs config errors print (§5.4).

import type { z } from "zod";

export interface IssueLine {
	/** Dotted key path, or `(root)` for the file itself. */
	path: string;
	message: string;
}

/**
 * Flatten zod's issues into one line each. zod 4 reports a bad record key, like
 * `[commands."Bad Name"]`, as one `invalid_key` issue that says only "Invalid
 * key in record" and nests the key schema's own issues under it. Those nested
 * issues carry the message we wrote for the key, so each one replaces its
 * wrapper, at the wrapper's path plus its own.
 */
export function issueLines(issues: ReadonlyArray<z.core.$ZodIssue>): Array<IssueLine> {
	const lines: Array<IssueLine> = [];
	const visit = (issue: z.core.$ZodIssue, prefix: ReadonlyArray<PropertyKey>): void => {
		const path = [...prefix, ...issue.path];
		const nested = "issues" in issue ? issue.issues : undefined;
		if (nested?.length) {
			for (const inner of nested) {
				visit(inner, path);
			}
			return;
		}
		lines.push({
			path: path.length ? path.map(String).join(".") : "(root)",
			message: issue.message,
		});
	};
	for (const issue of issues) {
		visit(issue, []);
	}
	return lines;
}
