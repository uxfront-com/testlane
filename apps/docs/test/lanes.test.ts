import { hold } from "@uxfront/scene";
import { describe, expect, it } from "vitest";
import { lanes } from "../app/lib/formations/lanes";
import {
	LANES,
	LANE_APPROACH,
	laneProgress,
} from "../app/lib/formations/lanes.geometry";

const approaches = [0, 0.25, 0.5, 0.75, 1];

describe("the lanes formation", () => {
	it("is its own formation, keyed lanes, with an anchor per workspace", () => {
		const formation = lanes({ label: "Testlane" });
		expect(formation.key).toBe("lanes");
		expect(formation.anchors.map((anchor) => anchor.id)).toEqual(
			Array.from({ length: LANES }, (_, i) => `lanes:${i}`),
		);
	});

	it("grows its lanes while the chapter scrolls in, then while it's read", () => {
		expect(approaches.map((a) => laneProgress(a, 0))).toEqual(
			approaches.map((a) => a * LANE_APPROACH),
		);
		expect(laneProgress(1, 0)).toBe(LANE_APPROACH);
		expect(laneProgress(1, 1)).toBe(1);
	});

	it("keeps a held formation fully grown while it morphs in", () => {
		for (const approach of approaches) {
			expect(laneProgress(approach, 1), `approach ${approach}`).toBe(1);
		}
	});

	it("shows every workspace's label while a held formation morphs in", () => {
		const held = hold(lanes({ key: "hero", label: "Testlane" }), 1);
		const out: [number, number, number] = [0, 0, 0];
		for (const anchor of held.anchors) {
			for (const approach of approaches) {
				const shown = anchor.place(
					{ stage: 0, local: 1, approach, presence: 1, time: 0 },
					out,
				);
				expect(shown, `${anchor.id} at approach ${approach}`).toBe(1);
			}
		}
	});
});
