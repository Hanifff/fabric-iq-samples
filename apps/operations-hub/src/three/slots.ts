// The 3D models and their clickable parts ("slots"). Equipment rows point at a slot;
// anchors are points on each part, used to aim the camera and to place sample findings.
// Units are metres in model space (y is up). No imports, so tests can load this file.
export type Vec3 = [number, number, number];
export type ModelKey = 'subsea' | 'platform' | 'fpso' | 'wind' | 'module';
export type Slot = { label: string; anchor: Vec3 };
export type ModelInfo = {
  label: string;
  setting: 'subsea' | 'offshore' | 'yard';
  camera: Vec3;
  target: Vec3;
  // Rough size, used for pin size, zoom limits and the camera clip planes.
  size: number;
  slots: Record<string, Slot>;
};

export const MODELS: Record<ModelKey, ModelInfo> = {
  subsea: {
    label: 'Subsea production template',
    setting: 'subsea',
    camera: [27, 21, 31],
    target: [0, 3, 3],
    size: 40,
    slots: {
      FRAME: { label: 'Template and protection structure', anchor: [0, 7.6, -7.5] },
      XT1: { label: 'Christmas tree, well slot 1', anchor: [-6.5, 5.3, -4] },
      XT2: { label: 'Christmas tree, well slot 2', anchor: [6.5, 5.3, -4] },
      XT3: { label: 'Christmas tree, well slot 3', anchor: [-6.5, 5.3, 4] },
      XT4: { label: 'Christmas tree, well slot 4', anchor: [6.5, 5.3, 4] },
      MANIFOLD: { label: 'Production manifold', anchor: [0, 4.6, 0] },
      UMBILICAL: { label: 'Umbilical termination assembly', anchor: [-15.5, 1.7, -1] },
      JUMPER: { label: 'Rigid jumper and pipeline end', anchor: [0, 4.6, 10.5] },
      FLOWLINE: { label: 'Flowline to the host', anchor: [2, 0.9, 30] },
    },
  },
  platform: {
    label: 'Fixed platform (steel jacket)',
    setting: 'offshore',
    camera: [72, 52, 82],
    target: [0, 27, 0],
    size: 110,
    slots: {
      JACKET: { label: 'Steel jacket', anchor: [9.2, 4, 9.2] },
      M20: { label: 'Separation module', anchor: [-8, 37.6, -6] },
      M23: { label: 'Gas compression module', anchor: [7, 38.2, -6] },
      M43: { label: 'Power generation module', anchor: [7, 37.2, 7] },
      LQ: { label: 'Living quarters', anchor: [-9, 35.5, 13.2] },
      HELIDECK: { label: 'Helideck', anchor: [-11, 43.4, 10] },
      CRANE: { label: 'Pedestal crane', anchor: [20, 42.7, 2.2] },
      FLARE: { label: 'Flare boom', anchor: [-30, 51.1, -23.7] },
    },
  },
  fpso: {
    label: 'Floating production, storage and offloading unit (FPSO)',
    setting: 'offshore',
    camera: [235, 135, 235],
    target: [0, 12, 0],
    size: 280,
    slots: {
      HULL: { label: 'Hull and cargo tanks', anchor: [0, 4, 23.3] },
      TURRET: { label: 'Turret, risers and mooring', anchor: [100, 17.5, 0] },
      M21: { label: 'Separation module', anchor: [-30, 22.4, -10] },
      M23: { label: 'Gas compression module', anchor: [0, 22.4, -10] },
      M25: { label: 'Water injection module', anchor: [30, 22.4, -10] },
      M43: { label: 'Power generation module', anchor: [-30, 22.4, 10] },
      FLARE: { label: 'Flare tower', anchor: [75, 60, -16] },
      LQ: { label: 'Living quarters', anchor: [-94.8, 22, 0] },
      HELIDECK: { label: 'Helideck', anchor: [-108, 35.3, 0] },
    },
  },
  wind: {
    label: 'Floating wind turbine (semi-submersible)',
    setting: 'offshore',
    camera: [270, 150, 290],
    target: [0, 88, 20],
    size: 260,
    slots: {
      FLOATER: { label: 'Semi-submersible floater', anchor: [-34.6, 12.4, -20] },
      TOWER: { label: 'Tower', anchor: [0, 70, 43.5] },
      NACELLE: { label: 'Nacelle and generator', anchor: [2, 127.2, 40] },
      ROTOR: { label: 'Rotor and blades', anchor: [-11.6, 123.5, 40] },
      MOORING: { label: 'Mooring lines', anchor: [-91.8, -53, -53] },
      CABLE: { label: 'Dynamic export cable', anchor: [0, -42, 95] },
    },
  },
  module: {
    label: 'Process module at the yard',
    setting: 'yard',
    camera: [54, 37, 62],
    target: [0, 11, 0],
    size: 70,
    slots: {
      FRAME: { label: 'Module steel frame', anchor: [15, 22, 10] },
      TURBINE: { label: 'Gas turbine driver', anchor: [-6, 6.7, -5] },
      COMPRESSOR: { label: 'Centrifugal compressor', anchor: [6.5, 5.5, -5] },
      SCRUBBER: { label: 'Suction scrubber', anchor: [10, 14.1, 5] },
      COOLER: { label: 'Gas cooler', anchor: [0, 27.2, 1] },
      PIPING: { label: 'Process piping', anchor: [12.5, 14, -6] },
      EROOM: { label: 'Electrical room', anchor: [-8, 15.7, 4] },
    },
  },
};

export const isModelKey = (value?: string): value is ModelKey => Boolean(value && value in MODELS);
