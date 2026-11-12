import { glslArray, glslFloat, glslVec } from "@uxfront/scene";
import type { FormationShader } from "@uxfront/scene";

import {
	BOX_HH,
	BOX_X0,
	BOX_X1,
	LANE_APPROACH,
	LANE_BEND,
	LANE_COLORS,
	TRUNK_X0,
	branchX,
	laneY,
} from "./lanes.geometry";

const f = glslFloat;

// The GLSL mirrors lanes.geometry.ts: keep the two in step.
export const shader: FormationShader = {
	glsl: /* glsl */ `
const float $TRUNK_X0 = ${f(TRUNK_X0)};
const float $BRANCH_X0 = ${f(branchX(0))};
const float $BRANCH_DX = ${f(branchX(1) - branchX(0))};
const float $LANE_Y0 = ${f(laneY(0))};
const float $LANE_DY = ${f(laneY(1) - laneY(0))};
const float $LANE_BEND = ${f(LANE_BEND)};
const float $BOX_X0 = ${f(BOX_X0)};
const float $BOX_X1 = ${f(BOX_X1)};
const float $BOX_HH = ${f(BOX_HH)};
const vec3 $COLORS[4] = ${glslArray("vec3", LANE_COLORS.map(glslVec))};

// Lanes start growing as the chapter scrolls in (see laneProgress).
float $progress(Frame f) {
  if (f.approach < 1.0) return f.approach * ${f(LANE_APPROACH)};
  return mix(${f(LANE_APPROACH)}, 1.0, f.local);
}

float $branchX(int i) { return $BRANCH_X0 + float(i) * $BRANCH_DX; }
float $laneY(int i) { return $LANE_Y0 + float(i) * $LANE_DY; }
float $reach(int i, float p) {
  float o = float(i) * 0.12;
  return smoothstep(o, o + 0.5, p);
}
float $settle(float reach) { return smoothstep(0.82, 1.0, reach); }

// A point along lane i, s = 0 at the stream, 1 at its workspace: a bend away
// from the stream, then straight along its own height.
vec2 $lanePath(int i, float s) {
  vec2 a = vec2($branchX(i), 0.0);
  vec2 b = vec2(a.x + $LANE_BEND, $laneY(i));
  float bend = $LANE_BEND / ($BOX_X0 - a.x);
  if (s < bend) {
    return bezier3(a, a + vec2($LANE_BEND * 0.5, 0.0), b - vec2($LANE_BEND * 0.5, 0.0), b, s / bend);
  }
  return mix(b, vec2($BOX_X0, b.y), (s - bend) / (1.0 - bend));
}

Particle $main(uint id, float sel, Frame f) {
  float p = $progress(f);
  float time = f.time;
  uint s = seedOf(id, 0x1A9E5u);
  float a = rnd(s);
  float b = rnd(s);
  float c = rnd(s);
  float d = rnd(s);
  Particle P = blank();
  vec2 g = gauss(b, c);
  float halo = step(0.82, d);

  if (sel < 0.14) {
    // The repository: one stream of white light, up to the last branch.
    float end = $branchX(3) + 0.2;
    float sp = fract(a + time * 0.04);
    float x = mix($TRUNK_X0, end, sp);
    vec2 off = g * mix(0.018, 0.07, halo);
    float pulse = pow(0.5 + 0.5 * sin(sp * 70.0 - time * 3.5), 10.0);
    P.pos = vec3(x, off.x, off.y);
    P.col = vec3(1.0, 0.97, 0.92) * mix(0.9, 0.12, halo) * (1.0 + pulse * 1.4)
      // It brightens on its way in, so it stays faint behind copy on its left.
      * mix(0.08, 1.0, smoothstep(0.3, 0.85, sp)) * smoothstep(0.0, 0.1, sp)
      * (1.0 - smoothstep(0.96, 1.0, sp));
    P.size = mix(0.85, 1.1, halo);
  } else if (sel < 0.56) {
    // Four lanes, one per ref, branching off as the chapter is read.
    int i = min(int((sel - 0.14) / 0.42 * 4.0), 3);
    float reach = $reach(i, p);
    float sp = fract(a + time * 0.05) * reach;
    vec2 q = $lanePath(i, sp);
    vec2 off = g * mix(0.012, 0.045, halo);
    float pulse = pow(0.5 + 0.5 * sin(sp * 48.0 - time * 4.0 + float(i) * 1.7), 10.0);
    float front = smoothstep(reach - 0.05, reach, sp) * (1.0 - smoothstep(0.97, 1.0, reach));
    // A lane that has only just branched packs its particles into a few
    // pixels: dim it until it has room, or the branch point flares.
    float packed = mix(0.2, 1.0, smoothstep(0.05, 0.4, reach));
    P.pos = vec3(q.x, q.y + off.x, off.y);
    P.col = $COLORS[i] * mix(0.8, 0.1, halo) * (1.0 + pulse * 1.5 + front * 3.0) * packed
      * step(0.001, reach);
    P.size = mix(0.8, 1.1, halo);
  } else if (sel < 0.93) {
    // The workspaces: each unfolds from the end of its lane once the lane
    // arrives, into a box of light with its own contents.
    int i = min(int(a * 4.0), 3);
    float y = $laneY(i);
    float settle = $settle($reach(i, p));
    vec2 door = vec2($BOX_X0, y);
    vec2 center = vec2(($BOX_X0 + $BOX_X1) * 0.5, y);
    vec2 half_ = vec2(($BOX_X1 - $BOX_X0) * 0.5, $BOX_HH);
    vec3 col = $COLORS[i];
    vec2 q;
    float bright;
    float z = 0.0;
    if (sel < 0.74) {
      // The outline.
      q = rrectPoint(vec4(center, half_), 0.07, b) + g * 0.004;
      bright = 0.55;
      P.size = 0.8;
    } else if (sel < 0.84) {
      // A faint fill: the workspace is lit from inside.
      q = center + (vec2(b, c) * 2.0 - 1.0) * (half_ - 0.03);
      z = (d - 0.5) * 0.06;
      bright = 0.05;
      P.size = 0.9;
    } else if (sel < 0.87) {
      // Three dots in the title bar.
      float k = floor(b * 3.0);
      vec2 dot_ = vec2($BOX_X0 + 0.1 + k * 0.065, y + $BOX_HH - 0.075);
      q = dot_ + g * 0.009;
      bright = 0.5;
      P.size = 0.75;
    } else {
      // Two lines of output, the second typed out behind a blinking cursor.
      bool second = b < 0.5;
      float lineY = second ? y - 0.075 : y + 0.015;
      float len = (second ? 0.55 : 0.95) + 0.25 * fract(float(i) * 0.618 + (second ? 0.3 : 0.0));
      float typed = second ? fract(time * 0.12 + float(i) * 0.27) : 1.0;
      float x0 = $BOX_X0 + 0.1;
      if (second && c < 0.12) {
        // The cursor.
        q = vec2(x0 + len * typed + 0.03, lineY) + (vec2(d, rnd(s)) - 0.5) * vec2(0.03, 0.05);
        bright = 1.1 * step(0.5, fract(time * 1.6));
      } else {
        q = vec2(x0 + c * len * typed, lineY + g.x * 0.006);
        bright = 0.42;
      }
      P.size = 0.75;
    }
    // Before it settles, a workspace is a knot of light at its lane's end.
    vec2 knot = door + g * 0.03;
    P.pos = vec3(mix(knot, q, settle), z * settle);
    P.col = col * bright * mix(0.15, 1.0, settle) * step(0.001, $reach(i, p));
  } else if (sel < 0.955) {
    // A port on each workspace's right edge, where its label is pinned.
    int i = min(int(a * 4.0), 3);
    vec2 center = vec2($BOX_X1, $laneY(i));
    bool ring = b < 0.7;
    vec2 q = ring ? center + 0.05 * vec2(cos(c * TAU), sin(c * TAU)) : center + g * 0.01;
    P.pos = vec3(q, 0.0);
    P.col = $COLORS[i] * (ring ? 0.7 : 1.5) * $settle($reach(i, p));
    P.size = 0.8;
  } else {
    // Dust drifting through the light.
    vec3 q = vec3(mix(-6.0, 7.0, a), mix(-2.4, 2.4, b), mix(-2.5, 2.5, c));
    q.x = mod(q.x + time * 0.05 + 6.0, 13.0) - 6.0;
    P.pos = q;
    P.col = vec3(0.7, 0.9, 0.8) * 0.05;
    P.size = 0.9;
  }
  return P;
}
`,
};
