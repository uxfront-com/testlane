import { describe, expect, it } from "vitest";
import { parseRef } from "../../../src/core/resolve";
import {
	REF_SAMPLES,
	WORKSPACES,
	configCode,
	refsCode,
} from "../app/data/samples";

describe("the homepage's samples", () => {
	it("parses every sample the way its comment says", () => {
		for (const { ref, kind } of REF_SAMPLES) {
			expect(parseRef(ref).kind, ref).toBe(kind);
		}
	});

	it("shows each sample as itself, or as its start and an ellipsis", () => {
		for (const { ref, shown } of REF_SAMPLES) {
			if (shown === undefined) continue;
			expect(shown.endsWith("…"), shown).toBe(true);
			expect(ref.startsWith(shown.slice(0, -1)), shown).toBe(true);
		}
	});

	it("labels the workspaces with refs that parse as what they stand for", () => {
		for (const { ref, kind } of WORKSPACES) {
			expect(parseRef(ref).kind, ref).toBe(kind);
		}
	});

	it("fits every line of the code samples on a 320px phone", () => {
		// UxCode's panel holds about 30 characters of Geist Mono at that width.
		for (const line of [...refsCode.split("\n"), ...configCode.split("\n")]) {
			expect(line.length, line).toBeLessThanOrEqual(30);
		}
	});
});
