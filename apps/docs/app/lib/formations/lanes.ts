import { defineFormation, mergeViews } from "@uxfront/scene";
import type { AnchorDef, Formation, FormationOptions } from "@uxfront/scene";

import {
	BOX_X1,
	LANES,
	laneProgress,
	laneReach,
	laneY,
	settleOf,
} from "./lanes.geometry";

/**
 * What Testlane does, drawn in light: one stream (the repository) from which
 * refs branch off into parallel lanes, each settling into a lit workspace of
 * its own beside the others. The lanes branch off one after another as the
 * chapter is read, so hold it with `hold()` to show all four at once.
 *
 * Anchors `lanes:0` to `lanes:3` sit at each workspace's port, on its right
 * edge, top to bottom, and show once the workspace has taken shape. Pin a ref
 * and its port there.
 */
export function lanes(options: FormationOptions): Formation {
	const anchors: AnchorDef[] = Array.from({ length: LANES }, (_, index) => ({
		id: String(index),
		place: ({ approach, local }, out) => {
			out[0] = BOX_X1;
			out[1] = laneY(index);
			out[2] = 0;
			return settleOf(laneReach(index, laneProgress(approach, local)));
		},
	}));

	return defineFormation({
		key: options.key ?? "lanes",
		label: options.label,
		views: mergeViews(
			{
				desktop: {
					eye: [0.9, 0.7, 11],
					target: [0.7, 0, 0],
					fov: 30,
					span: [3.4, 1.15],
					shift: [0.1, 0.1],
				},
				mobile: {
					eye: [1.4, 0.7, 11],
					target: [1.3, 0, 0],
					fov: 34,
					span: [2.7, 1.1],
					shift: [0, 0.5],
				},
			},
			options.views,
		),
		look: { bloom: 1.1, ...options.look },
		anchors,
		shader: () => import("./lanes.shader").then((m) => m.shader),
	});
}
