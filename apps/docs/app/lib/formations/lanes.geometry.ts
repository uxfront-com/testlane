import { lerp, smoothstep } from "@uxfront/scene";
import type { Vec3 } from "@uxfront/scene";

/**
 * The shape of the `lanes` formation, shared by its anchors (on the CPU) and
 * its shader (on the GPU), so a label sits exactly where its workspace is drawn.
 *
 * One stream of light, the repository, comes in from the left along y = 0. Four
 * refs branch off it one after another, each into a lane of its own, and the
 * lanes run side by side into four workspaces, boxes of light from
 * `BOX_X0` to `BOX_X1`, each with a port at its right edge.
 */
export const LANES = 4;

/** Where the repository's stream starts, far off the left of the frame. */
export const TRUNK_X0 = -9.5;

/** Where lane `i` leaves the stream. The first ref branches off first. */
export const branchX = (index: number) => -2.6 + index * 0.45;

/** The height of lane `i`, top to bottom. */
export const laneY = (index: number) => 0.78 - index * 0.52;

/** How far a lane runs while it bends away from the stream. */
export const LANE_BEND = 1.1;

/** The workspaces' left and right edges, and their half height. */
export const BOX_X0 = 1.9;
export const BOX_X1 = 3.7;
export const BOX_HH = 0.19;

/** The lanes' colours, top to bottom: from lime through green to cyan. */
export const LANE_COLORS: Vec3[] = [
	[0.62, 1, 0.3],
	[0.2, 1, 0.45],
	[0.14, 0.95, 0.78],
	[0.2, 0.74, 1],
];

/** Share of the lanes' growth that happens while the chapter scrolls in. */
export const LANE_APPROACH = 0.35;

/** Lane progress: starts with the morph into the formation, not once it's held. */
export const laneProgress = (approach: number, local: number) =>
	approach < 1 ? approach * LANE_APPROACH : lerp(LANE_APPROACH, 1, local);

/** Lanes branch off one after another as the chapter is read: 0 → 1 each. */
export const laneReach = (index: number, progress: number) =>
	smoothstep(index * 0.12, index * 0.12 + 0.5, progress);

/** A workspace takes shape once its lane has reached it: 0 → 1. */
export const settleOf = (reach: number) => smoothstep(0.82, 1, reach);
