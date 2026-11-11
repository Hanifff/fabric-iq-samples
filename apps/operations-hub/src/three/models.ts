import * as THREE from 'three';
import { MODELS, type ModelKey, type Vec3 } from './slots';

// Simplified, procedurally built 3D models (no downloaded assets). Each clickable part is a
// group with `userData.slot`; meshes keep their base colour so the viewer can repaint them.
export type Built = {
  root: THREE.Group;
  parts: Map<string, THREE.Group>;
  tick?: (seconds: number) => void;
};

const UP = new THREE.Vector3(0, 1, 0);
const v = (point: Vec3) => new THREE.Vector3(...point);
const lerp = (a: Vec3, b: Vec3, t: number): Vec3 => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

type Finish = { opacity?: number; metalness?: number; roughness?: number };

function add(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, at?: Vec3, finish: Finish = {}) {
  const opacity = finish.opacity ?? 1;
  const material = new THREE.MeshStandardMaterial({
    color, roughness: finish.roughness ?? 0.62, metalness: finish.metalness ?? 0.28,
    transparent: opacity < 1, opacity, depthWrite: opacity >= 1, side: opacity < 1 ? THREE.DoubleSide : THREE.FrontSide,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.userData.baseColor = color;
  mesh.userData.baseOpacity = opacity;
  if (at) mesh.position.set(...at);
  parent.add(mesh);
  return mesh;
}

const box = (parent: THREE.Object3D, size: Vec3, color: string, at: Vec3, finish?: Finish) =>
  add(parent, new THREE.BoxGeometry(...size), color, at, finish);

function cylinder(parent: THREE.Object3D, radius: number, height: number, color: string, at: Vec3,
  segments = 24, radiusBottom = radius, axis: 'x' | 'y' | 'z' = 'y') {
  const mesh = add(parent, new THREE.CylinderGeometry(radius, radiusBottom, height, segments), color, at);
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  return mesh;
}

// A round bar between two points (legs, braces, booms).
function rod(parent: THREE.Object3D, from: Vec3, to: Vec3, radius: number, color: string, segments = 10) {
  const a = v(from);
  const b = v(to);
  const mesh = add(parent, new THREE.CylinderGeometry(radius, radius, a.distanceTo(b), segments), color);
  mesh.position.copy(a).add(b).multiplyScalar(0.5);
  mesh.quaternion.setFromUnitVectors(UP, b.clone().sub(a).normalize());
  return mesh;
}

function pipe(parent: THREE.Object3D, points: Vec3[], radius: number, color: string, segments = 64) {
  const curve = new THREE.CatmullRomCurve3(points.map(v), false, 'catmullrom', 0.2);
  const mesh = add(parent, new THREE.TubeGeometry(curve, segments, radius, 12, false), color);
  return { mesh, curve };
}

// A pressure vessel: cylinder with rounded ends.
function vessel(parent: THREE.Object3D, radius: number, length: number, color: string, at: Vec3, axis: 'x' | 'y' | 'z') {
  const mesh = add(parent, new THREE.CapsuleGeometry(radius, length, 6, 20), color, at, { metalness: 0.4, roughness: 0.45 });
  if (axis === 'x') mesh.rotation.z = Math.PI / 2;
  if (axis === 'z') mesh.rotation.x = Math.PI / 2;
  return mesh;
}

// Unlit, never repainted: flare flames.
function glow(parent: THREE.Object3D, geometry: THREE.BufferGeometry, color: string, at: Vec3) {
  const mesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85 }));
  mesh.position.set(...at);
  mesh.userData.glow = true;
  parent.add(mesh);
  return mesh;
}

function start() {
  const root = new THREE.Group();
  const parts = new Map<string, THREE.Group>();
  const scenery = new THREE.Group();
  scenery.userData.scenery = true;
  root.add(scenery);
  const part = (slot: string) => {
    const group = new THREE.Group();
    group.name = slot;
    group.userData.slot = slot;
    root.add(group);
    parts.set(slot, group);
    return group;
  };
  return { root, parts, scenery, part };
}

function sea(scenery: THREE.Group, radius: number, seabedY: number) {
  const surface = add(scenery, new THREE.CircleGeometry(radius * 8, 96), '#2f74a3', [0, 0, 0],
    { opacity: 0.42, metalness: 0.1, roughness: 0.15 });
  surface.rotation.x = -Math.PI / 2;
  surface.renderOrder = 2;
  const bed = add(scenery, new THREE.CircleGeometry(radius * 8, 72), '#3f4f55', [0, seabedY, 0], { metalness: 0, roughness: 1 });
  bed.rotation.x = -Math.PI / 2;
}

function helideck(parent: THREE.Object3D, radius: number, at: Vec3) {
  cylinder(parent, radius, radius * 0.08, '#2f6b45', at, 8);
  const top = at[1] + radius * 0.04 + 0.03;
  const bar = radius * 0.65;
  box(parent, [radius * 0.12, 0.06, bar], '#f4f4ee', [at[0] - radius * 0.22, top, at[2]]);
  box(parent, [radius * 0.12, 0.06, bar], '#f4f4ee', [at[0] + radius * 0.22, top, at[2]]);
  box(parent, [radius * 0.44, 0.06, radius * 0.12], '#f4f4ee', [at[0], top, at[2]]);
}

// Four-slot subsea template: trees, manifold, umbilical termination, jumper and flowline.
function subsea(): Built {
  const { root, parts, scenery, part } = start();
  const bed = add(scenery, new THREE.CircleGeometry(76, 72), '#4b584f', [0, 0, 0], { metalness: 0, roughness: 1 });
  bed.rotation.x = -Math.PI / 2;
  for (const [x, z, r] of [[-30, 18, 1.2], [22, -26, 0.9], [-12, -35, 1.6], [40, 10, 1.1], [-45, -8, 0.8], [30, 36, 1.4]]) {
    add(scenery, new THREE.DodecahedronGeometry(r), '#5e665d', [x, r * 0.35, z], { metalness: 0, roughness: 1 });
  }
  const steel = '#d08a2c';
  const yellow = '#e2be3d';
  const grey = '#9ba5aa';
  const dark = '#2f363a';
  const y0 = 2.4;
  const roof = 7.4;

  const frame = part('FRAME');
  for (const [x, z] of [[-10, -6], [10, -6], [-10, 6], [10, 6]]) cylinder(frame, 2.1, 2.6, steel, [x, 1.3, z], 28);
  box(frame, [24, 0.7, 0.7], steel, [0, y0, -7.5]);
  box(frame, [24, 0.7, 0.7], steel, [0, y0, 7.5]);
  box(frame, [0.7, 0.7, 15], steel, [-11.5, y0, 0]);
  box(frame, [0.7, 0.7, 15], steel, [11.5, y0, 0]);
  box(frame, [24, 0.6, 0.6], steel, [0, y0, 0]);
  for (const x of [-3.8, 3.8]) box(frame, [0.6, 0.6, 15], steel, [x, y0, 0]);
  for (const [x, z] of [[-11.5, -7.5], [11.5, -7.5], [-11.5, 7.5], [11.5, 7.5]]) {
    box(frame, [0.6, roof - y0, 0.6], steel, [x, (roof + y0) / 2, z]);
  }
  box(frame, [24, 0.5, 0.5], steel, [0, roof, -7.5]);
  box(frame, [24, 0.5, 0.5], steel, [0, roof, 7.5]);
  box(frame, [0.5, 0.5, 15], steel, [-11.5, roof, 0]);
  box(frame, [0.5, 0.5, 15], steel, [11.5, roof, 0]);
  for (const z of [-7.5, 7.5]) {
    rod(frame, [-11.5, y0, z], [0, roof, z], 0.18, steel);
    rod(frame, [11.5, y0, z], [0, roof, z], 0.18, steel);
  }
  // Roof hatches, hinged at the long edges and folded open for intervention.
  for (const side of [-1, 1]) {
    const hinge = new THREE.Group();
    hinge.position.set(0, roof, side * 7.5);
    hinge.rotation.x = side * (125 * Math.PI) / 180;
    box(hinge, [23, 0.15, 7.4], steel, [0, 0, -side * 3.7], { opacity: 0.55 });
    frame.add(hinge);
  }

  const wells: [string, number, number][] = [['XT1', -6.5, -4], ['XT2', 6.5, -4], ['XT3', -6.5, 4], ['XT4', 6.5, 4]];
  for (const [slot, wx, wz] of wells) {
    const tree = part(slot);
    tree.position.set(wx, 0, wz);
    const inward = wx < 0 ? 1 : -1;
    const outward = wz < 0 ? -1 : 1;
    cylinder(tree, 0.6, 1.3, grey, [0, 3.25, 0]);
    box(tree, [1.7, 1.9, 1.7], yellow, [0, 4.85, 0]);
    cylinder(tree, 0.5, 0.5, grey, [0, 6.05, 0]);
    for (const [px, pz] of [[-1.25, -1.25], [1.25, -1.25], [-1.25, 1.25], [1.25, 1.25]]) box(tree, [0.14, 3.6, 0.14], dark, [px, 4.6, pz]);
    box(tree, [2.64, 0.14, 0.14], dark, [0, 6.4, -1.25]);
    box(tree, [2.64, 0.14, 0.14], dark, [0, 6.4, 1.25]);
    box(tree, [0.14, 0.14, 2.64], dark, [-1.25, 6.4, 0]);
    box(tree, [0.14, 0.14, 2.64], dark, [1.25, 6.4, 0]);
    cylinder(tree, 0.32, 1.5, grey, [inward * 1.6, 5.1, 0], 16, 0.32, 'x');
    box(tree, [0.55, 0.7, 0.55], yellow, [inward * 1.9, 5.65, 0]);
    box(tree, [0.7, 0.95, 0.6], '#ee8a2a', [0, 4.4, outward * 1.2]);
    box(tree, [0.08, 1, 1.3], '#d6dbde', [-inward * 0.9, 4.9, 0]);
    for (const dz of [-0.4, 0, 0.4]) cylinder(tree, 0.07, 0.3, dark, [-inward * 1.05, 4.9, dz], 8, 0.07, 'x');
  }

  const manifold = part('MANIFOLD');
  box(manifold, [9.4, 0.9, 3.4], yellow, [0, 3.2, 0]);
  for (const z of [-0.75, 0.75]) cylinder(manifold, 0.36, 9, '#b8c0c4', [0, 4.05, z], 20, 0.36, 'x');
  for (const x of [-3, 3]) {
    for (const z of [-0.75, 0.75]) {
      cylinder(manifold, 0.42, 0.8, grey, [x, 4.6, z]);
      const wheel = add(manifold, new THREE.TorusGeometry(0.4, 0.06, 8, 24), yellow, [x, 5.15, z]);
      wheel.rotation.x = Math.PI / 2;
    }
  }
  for (const [, wx, wz] of wells) {
    const inward = wx < 0 ? 1 : -1;
    const outlet = wx + inward * 2.35;
    const header = wz < 0 ? -0.75 : 0.75;
    pipe(manifold, [[outlet, 5.1, wz], [outlet + inward * 0.5, 5.1, wz * 0.7], [Math.sign(wx) * 4.6, 4.5, header * 2.2],
      [Math.sign(wx) * 4.5, 4.05, header]], 0.2, '#b8c0c4', 32);
  }

  const umbilical = part('UMBILICAL');
  box(umbilical, [3.4, 0.2, 2.6], steel, [-15.5, 0.1, -1]);
  box(umbilical, [2.2, 1.4, 1.6], yellow, [-15.5, 0.9, -1]);
  pipe(umbilical, [[-16.7, 0.5, -1], [-24, 0.3, -4], [-40, 0.3, -12], [-58, 0.3, -24], [-72, 0.3, -30]], 0.24, '#2c3236', 48);
  for (const [, wx, wz] of wells) {
    const outward = wz < 0 ? -1 : 1;
    pipe(umbilical, [[-14.6, 1.5, -1], [(-14.6 + wx) / 2, 1.1, (-1 + wz + outward * 2) / 2], [wx, 4.1, wz + outward * 1.55]],
      0.07, '#f2b134', 40);
  }

  const jumper = part('JUMPER');
  pipe(jumper, [[0, 4.05, 0.75], [0, 4, 3.5], [0, 3.6, 7], [0, 4.6, 9], [0, 4.6, 12], [0, 2.6, 13.8], [0, 1.6, 14.6]], 0.3, '#b8c0c4', 72);
  box(jumper, [3.8, 0.2, 3.8], steel, [0, 0.1, 15.8]);
  box(jumper, [2.4, 1.3, 2.6], yellow, [0, 0.85, 15.8]);

  const flowline = part('FLOWLINE');
  pipe(flowline, [[0, 0.45, 17.2], [0.6, 0.45, 24], [2, 0.45, 30], [5, 0.45, 42], [9, 0.45, 56], [13, 0.45, 74]], 0.45, '#3a4246', 64);
  return { root, parts };
}

// Fixed steel jacket platform with topside modules. Water depth is not to scale.
function platform(): Built {
  const { root, parts, scenery, part } = start();
  sea(scenery, 170, -62);
  const yellow = '#d39a2e';
  const corners = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  const leg = (sx: number, sz: number, y: number): Vec3 => {
    const t = (y + 62) / 83;
    const r = 14 - 5.5 * t;
    return [sx * r, y, sz * r];
  };

  const jacket = part('JACKET');
  for (const [sx, sz] of corners) rod(jacket, leg(sx, sz, -62), leg(sx, sz, 21), 1, yellow, 16);
  const levels = [-58, -40, -18, 4, 19];
  for (const y of levels) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      rod(jacket, leg(ax, az, y), leg(bx, bz, y), 0.45, yellow);
    }
  }
  for (let level = 0; level < levels.length - 1; level++) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = corners[i];
      const [bx, bz] = corners[(i + 1) % 4];
      rod(jacket, leg(ax, az, levels[level]), leg(bx, bz, levels[level + 1]), 0.35, yellow);
      rod(jacket, leg(bx, bz, levels[level]), leg(ax, az, levels[level + 1]), 0.35, yellow);
    }
  }

  box(scenery, [30, 1.2, 30], '#8c959a', [0, 21.6, 0]);
  for (const [sx, sz] of corners) rod(scenery, [sx * 9, 22.2, sz * 9], [sx * 9, 27.8, sz * 9], 0.8, '#8c959a');
  box(scenery, [34, 1.2, 32], '#a2aaaf', [0, 28.4, 0]);

  const separation = part('M20');
  for (const [dx, dz] of [[-5, -4.5], [5, -4.5], [-5, 4.5], [5, 4.5]]) box(separation, [0.5, 8, 0.5], '#5f7f95', [-8 + dx, 33, -6 + dz]);
  box(separation, [10.5, 0.4, 9.5], '#5f7f95', [-8, 37.2, -6]);
  vessel(separation, 1.8, 5.5, '#d4d9dc', [-8, 31.2, -6], 'x');
  vessel(separation, 0.9, 3.4, '#d4d9dc', [-11.6, 32, -9], 'y');

  const compression = part('M23');
  box(compression, [10, 9, 9], '#4f7aa0', [7, 33.5, -6]);
  box(compression, [3, 2, 4], '#6c8aa6', [5, 39, -6]);
  cylinder(compression, 0.9, 6, '#8b9196', [9.5, 41, -8.5]);

  const power = part('M43');
  box(power, [9, 8, 8], '#5a8c7b', [7, 33, 7]);
  cylinder(power, 0.7, 5, '#8b9196', [5, 39.5, 9]);
  cylinder(power, 0.7, 5, '#8b9196', [9, 39.5, 9]);

  const quarters = part('LQ');
  box(quarters, [11, 13, 10], '#e7ebed', [-9, 35.5, 8]);
  for (const y of [32, 35.5, 39]) box(quarters, [11.06, 0.7, 10.06], '#2b3f50', [-9, y, 8]);

  const deck = part('HELIDECK');
  helideck(deck, 7.5, [-11, 43, 10]);
  for (const [x, z] of [[-14, 5], [-5, 5], [-14, 12.5], [-5, 12.5]]) rod(deck, [x, 42, z], [x, 42.7, z], 0.25, '#7d868b');

  const crane = part('CRANE');
  cylinder(crane, 1.3, 7, '#e2b13c', [14, 32.5, 1]);
  box(crane, [3.2, 2.6, 3.2], '#e2b13c', [14, 37.3, 1]);
  const boomFrom: Vec3 = [14.5, 37.6, 1];
  const boomTo: Vec3 = [28, 50, 4];
  for (const dz of [-0.6, 0.6]) rod(crane, [boomFrom[0], boomFrom[1], boomFrom[2] + dz], [boomTo[0], boomTo[1], boomTo[2] + dz], 0.32, '#e2b13c');
  for (let i = 1; i < 7; i++) {
    const a = lerp(boomFrom, boomTo, i / 7);
    const b = lerp(boomFrom, boomTo, (i + 0.5) / 7);
    rod(crane, [a[0], a[1], a[2] - 0.6], [b[0], b[1], b[2] + 0.6], 0.12, '#e2b13c', 6);
  }
  rod(crane, boomTo, [28, 41, 4], 0.06, '#2f363a', 6);
  box(crane, [0.8, 0.8, 0.8], '#2f363a', [28, 40.6, 4]);

  const flare = part('FLARE');
  const flareFrom: Vec3 = [-15, 29, -14];
  const flareTo: Vec3 = [-32, 54, -25];
  for (const [dy, dz] of [[0, -1], [0, 1], [1.8, 0]]) {
    rod(flare, [flareFrom[0], flareFrom[1] + dy, flareFrom[2] + dz], [flareTo[0], flareTo[1] + dy, flareTo[2] + dz], 0.35, '#b9c0c4');
  }
  for (let i = 1; i < 9; i++) {
    const a = lerp(flareFrom, flareTo, i / 9);
    rod(flare, [a[0], a[1], a[2] - 1], [a[0], a[1] + 1.8, a[2]], 0.12, '#b9c0c4', 6);
    rod(flare, [a[0], a[1], a[2] + 1], [a[0], a[1] + 1.8, a[2]], 0.12, '#b9c0c4', 6);
  }
  cylinder(flare, 0.8, 2.2, '#6d7378', [-32.4, 56, -25.2]);
  glow(flare, new THREE.ConeGeometry(1.6, 5.5, 16), '#ff8a2a', [-32.6, 59.6, -25.3]);
  return { root, parts };
}

// Turret-moored FPSO: hull, turret with risers and mooring, process modules, flare and quarters.
function fpso(): Built {
  const { root, parts, scenery, part } = start();
  sea(scenery, 340, -60);
  const outline = new THREE.Shape();
  outline.moveTo(-120, -23);
  outline.lineTo(92, -23);
  outline.quadraticCurveTo(122, -20, 124, 0);
  outline.quadraticCurveTo(122, 20, 92, 23);
  outline.lineTo(-120, 23);
  outline.closePath();

  const hull = part('HULL');
  const lower = new THREE.ExtrudeGeometry(outline, { depth: 14, bevelEnabled: false, curveSegments: 16 });
  lower.rotateX(-Math.PI / 2);
  add(hull, lower, '#9a3e32', [0, -16, 0]);
  const upper = new THREE.ExtrudeGeometry(outline, { depth: 12, bevelEnabled: false, curveSegments: 16 });
  upper.rotateX(-Math.PI / 2);
  add(hull, upper, '#6d7a82', [0, -2, 0]);
  box(scenery, [176, 1.6, 3.2], '#9aa3a8', [-8, 11.6, 0]);
  for (let x = -90; x <= 80; x += 17) rod(scenery, [x, 10, 0], [x, 10.8, 0], 0.5, '#9aa3a8');

  const turret = part('TURRET');
  cylinder(turret, 7, 26, '#c7a23a', [100, -2, 0], 32);
  cylinder(turret, 9, 1.4, '#d2ad45', [100, 12, 0], 32);
  box(turret, [7, 5, 7], '#d2ad45', [100, 15.2, 0]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + 0.3;
    const points: Vec3[] = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const r = 6 + 150 * t;
      return [100 + Math.cos(a) * r, -14 - 46 * Math.sqrt(t), Math.sin(a) * r];
    });
    pipe(turret, points, 0.35, '#2e3336', 40);
  }
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 1.1;
    const at = (r: number, y: number): Vec3 => [100 + Math.cos(a) * r, y, Math.sin(a) * r];
    pipe(turret, [at(3, -15), at(14, -32), at(26, -40), at(38, -34), at(52, -46), at(70, -60)], 0.45, '#1f2a30', 48);
  }

  const modules: [string, number, number, string][] = [
    ['M21', -30, -10, '#4f7aa0'], ['M23', 0, -10, '#5a8c7b'], ['M25', 30, -10, '#7b6fa0'],
    ['M43', -30, 10, '#a07b4f'], ['M23', 0, 10, '#6f8f9a'], ['M25', 30, 10, '#8a8f6a'],
  ];
  for (const [slot, x, z, color] of modules) {
    const group = parts.get(slot) ?? part(slot);
    box(group, [24, 12, 16], color, [x, 16, z]);
    box(group, [24.06, 0.6, 16.06], '#2f3b44', [x, 13, z]);
    if (slot === 'M21') vessel(group, 2, 12, '#d4d9dc', [x, 24.5, z], 'x');
    if (slot === 'M23' && z < 0) for (const dx of [-6, 0, 6]) cylinder(group, 1.6, 1, '#3e4a52', [x + dx, 22.5, z]);
    if (slot === 'M43') for (const dx of [-5, 5]) cylinder(group, 1.1, 8, '#8b9196', [x + dx, 26, z + 4]);
  }

  const flare = part('FLARE');
  const fx = 75;
  const fz = -16;
  const chord = (dx: number, dz: number, y: number): Vec3 => {
    const t = (y - 10) / 56;
    return [fx + dx * (1 - 0.7 * t), y, fz + dz * (1 - 0.7 * t)];
  };
  const feet = [[-2.5, -2.5], [2.5, -2.5], [2.5, 2.5], [-2.5, 2.5]];
  for (const [dx, dz] of feet) rod(flare, chord(dx, dz, 10), chord(dx, dz, 66), 0.35, '#b9c0c4');
  for (let y = 10; y < 66; y += 8) {
    for (let i = 0; i < 4; i++) {
      const [ax, az] = feet[i];
      const [bx, bz] = feet[(i + 1) % 4];
      rod(flare, chord(ax, az, y), chord(bx, bz, y + 8), 0.14, '#b9c0c4', 6);
    }
  }
  cylinder(flare, 1.1, 3, '#6d7378', [fx, 67.5, fz]);
  glow(flare, new THREE.ConeGeometry(2.4, 8, 16), '#ff8a2a', [fx, 73, fz]);

  const quarters = part('LQ');
  box(quarters, [18, 24, 40], '#e7ebed', [-104, 22, 0]);
  for (const y of [16, 22, 28]) box(quarters, [18.06, 0.9, 40.06], '#2b3f50', [-104, y, 0]);
  const deck = part('HELIDECK');
  helideck(deck, 11, [-108, 34.8, 0]);

  for (const [x, z, toX, toZ] of [[55, 19, 80, 30], [-60, -19, -85, -30]]) {
    cylinder(scenery, 1.5, 8, '#e2b13c', [x, 14, z]);
    rod(scenery, [x, 18, z], [toX, 34, toZ], 0.5, '#e2b13c');
  }
  return { root, parts };
}

// Semi-submersible floating wind turbine with mooring and a lazy-wave export cable.
function wind(): Built {
  const { root, parts, scenery, part } = start();
  sea(scenery, 340, -90);
  const yellow = '#d9a32e';
  const columns: Vec3[] = [[0, 0, 40], [-34.64, 0, -20], [34.64, 0, -20]];

  const floater = part('FLOATER');
  for (const [x, , z] of columns) cylinder(floater, 6, 32, yellow, [x, -4, z], 32);
  for (let i = 0; i < 3; i++) {
    const a = columns[i];
    const b = columns[(i + 1) % 3];
    rod(floater, [a[0], -17, a[2]], [b[0], -17, b[2]], 2.6, '#c99428', 16);
    rod(floater, [a[0], 8, a[2]], [b[0], 8, b[2]], 1, '#c99428');
  }

  const tower = part('TOWER');
  cylinder(tower, 2.6, 108, '#eef2f3', [0, 66, 40], 32, 4.2);

  const nacelle = part('NACELLE');
  box(nacelle, [16, 7, 7], '#e3e7e9', [2, 123.5, 40]);

  const rotor = part('ROTOR');
  const hub = new THREE.Group();
  hub.position.set(-7.5, 123.5, 40);
  rotor.add(hub);
  const spinner = add(hub, new THREE.SphereGeometry(3, 24, 16), '#f2f4f5');
  spinner.scale.set(1.3, 1, 1);
  for (let i = 0; i < 3; i++) {
    const geometry = new THREE.BoxGeometry(0.9, 100, 4.2, 1, 12, 1);
    geometry.translate(0, 52.8, 0);
    const position = geometry.attributes.position;
    for (let index = 0; index < position.count; index++) {
      const along = (position.getY(index) - 2.8) / 100;
      const taper = 1 - 0.75 * along;
      position.setZ(index, position.getZ(index) * taper);
      position.setX(index, position.getX(index) * (0.6 + 0.4 * taper));
    }
    geometry.computeVertexNormals();
    const holder = new THREE.Group();
    holder.rotation.x = (i * Math.PI * 2) / 3;
    add(holder, geometry, '#f2f4f5').rotation.y = 0.12;
    hub.add(holder);
  }

  const mooring = part('MOORING');
  for (const [x, , z] of columns) {
    const direction = new THREE.Vector2(x, z).normalize();
    const points = [0, 0.25, 0.5, 0.75, 1].map((t): Vec3 => {
      const r = 6 + 240 * t;
      return [x + direction.x * r, -16 - 74 * Math.sqrt(t), z + direction.y * r];
    });
    pipe(mooring, points, 0.6, '#2e3336', 48);
  }

  const cable = part('CABLE');
  const { curve } = pipe(cable, [[0, -20, 46], [0, -38, 58], [0, -52, 74], [0, -42, 95], [0, -52, 116], [0, -78, 140], [0, -90, 170],
    [0, -90, 320]], 0.5, '#1f2a30', 120);
  for (let i = 0; i < 9; i++) {
    const t = 0.235 + i * 0.012;
    const point = curve.getPointAt(t);
    const buoy = add(cable, new THREE.CylinderGeometry(1.4, 1.4, 1.2, 16), '#e2832b');
    buoy.position.copy(point);
    buoy.quaternion.setFromUnitVectors(UP, curve.getTangentAt(t));
  }

  return { root, parts, tick: (seconds) => { hub.rotation.x += seconds * 0.55; } };
}

// A gas compression module in its steel frame, as built at a yard.
function processModule(): Built {
  const { root, parts, scenery, part } = start();
  box(scenery, [150, 0.5, 110], '#a3a8aa', [0, -0.25, 0], { metalness: 0, roughness: 1 });
  box(scenery, [150, 0.6, 50], '#2d6a86', [0, -2.2, 80], { metalness: 0.1, roughness: 0.2 });
  for (const z of [-10, 10]) box(scenery, [34, 1, 1.2], '#59616a', [0, 0.5, z]);
  const steel = '#7f97a6';
  const xs = [-15, -5, 5, 15];
  const zs = [-10, 10];

  const frame = part('FRAME');
  for (const x of xs) for (const z of zs) box(frame, [0.9, 24, 0.9], steel, [x, 12.5, z]);
  for (const y of [1, 9, 17, 24]) {
    for (const z of zs) box(frame, [31, 0.7, 0.7], steel, [0, y, z]);
    for (const x of xs) box(frame, [0.7, 0.7, 21], steel, [x, y, 0]);
  }
  for (const y of [1, 9, 17]) box(frame, [30, 0.15, 20], '#7d888e', [0, y + 0.4, 0], { opacity: 0.45 });
  box(frame, [30, 0.15, 20], '#7d888e', [0, 24.45, 0]);
  for (let i = 0; i < 3; i++) {
    for (const [y1, y2] of [[1, 9], [9, 17], [17, 24]]) {
      const [from, to] = i % 2 === 0 ? [xs[i], xs[i + 1]] : [xs[i + 1], xs[i]];
      rod(frame, [from, y1, -10], [to, y2, -10], 0.22, steel, 6);
    }
  }

  const turbine = part('TURBINE');
  box(turbine, [12, 5, 5], '#566a78', [-6, 4, -5]);
  box(turbine, [4, 2.6, 5], '#7c8f9c', [-10, 7.8, -5]);
  cylinder(turbine, 1.1, 22, '#8b9196', [-2.5, 17.5, -5]);

  const compressor = part('COMPRESSOR');
  box(compressor, [9, 0.8, 4], '#4c5a63', [5.5, 1.9, -5]);
  cylinder(compressor, 1.5, 6, '#6f8597', [6.5, 3.8, -5], 24, 1.5, 'x');
  cylinder(compressor, 0.45, 3, '#4c5a63', [1.75, 3.8, -5], 16, 0.45, 'x');

  const scrubber = part('SCRUBBER');
  vessel(scrubber, 1.7, 9, '#d5dadd', [10, 7.7, 5], 'y');

  const cooler = part('COOLER');
  box(cooler, [16, 2.2, 10], '#9aa7b0', [0, 25.65, 1]);
  for (const x of [-5, 0, 5]) for (const z of [-1.5, 3.5]) cylinder(cooler, 2, 0.4, '#3e4a52', [x, 26.95, z]);

  const piping = part('PIPING');
  pipe(piping, [[9.5, 3.8, -5], [11.5, 3.8, -5], [12.5, 7, -6], [12.5, 20, -6], [10, 24.2, -3], [6, 25, -2]], 0.35, '#d9b43a');
  pipe(piping, [[-6, 25, 4], [-9, 23.5, 7], [-9, 18, 8], [6, 17.5, 8], [10, 14.4, 6.6]], 0.35, '#d9b43a');
  pipe(piping, [[10, 1.9, 6.6], [10, 1.9, 8.2], [4, 1.9, 8.2], [2.5, 3, -2.5], [3.4, 3.8, -5]], 0.38, '#b9c1c5');
  for (const x of [-12, -2, 8]) box(piping, [0.4, 0.4, 3], '#8b9196', [x, 9.6, 8]);

  const room = part('EROOM');
  box(room, [10, 6, 8], '#eef1f2', [-8, 12.5, 4]);
  box(room, [1.4, 2.4, 0.1], '#455560', [-6, 10.7, 8.05]);
  return { root, parts };
}

const builders: Record<ModelKey, () => Built> = { subsea, platform, fpso, wind, module: processModule };

export function buildModel(key: ModelKey): Built {
  const built = builders[key]();
  for (const slot of Object.keys(MODELS[key].slots)) {
    if (!built.parts.has(slot)) throw new Error(`Model ${key} has no part for slot ${slot}.`);
  }
  return built;
}
