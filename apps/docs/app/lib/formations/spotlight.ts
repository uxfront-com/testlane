import { glslFloat, wrapMain } from "@uxfront/scene";
import type { Formation } from "@uxfront/scene";

/**
 * Lights the particles between `from` and `to` along the x axis and dims the
 * rest to `dim`, so a close-up reads as one part of the formation. The edges
 * fade over `soft` world units. For `lanes`: the repository's stream comes in
 * from the left (x < -1.2), the lanes branch off between -2.6 and 1.9 and the
 * workspaces sit between 1.9 and 3.7.
 */
export function spotlight(
	formation: Formation,
	from: number,
	to: number,
	{ soft = 0.4, dim = 0.22 }: { soft?: number; dim?: number } = {},
): Formation {
	return wrapMain(
		formation,
		"unlit",
		`  Particle P = $unlit(id, sel, f);
  float lit = smoothstep(${glslFloat(from - soft)}, ${glslFloat(from)}, P.pos.x)
    * (1.0 - smoothstep(${glslFloat(to)}, ${glslFloat(to + soft)}, P.pos.x));
  P.col *= mix(${glslFloat(dim)}, 1.25, lit);
  return P;`,
	);
}
