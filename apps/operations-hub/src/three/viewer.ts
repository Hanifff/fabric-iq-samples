import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { buildModel, type Built } from './models';
import { MODELS, type ModelKey, type Vec3 } from './slots';

export type Look = { color?: string; ghost?: boolean };
export type PinSpec = { id: string; at: Vec3; color: string; label: string; selected: boolean };
export type ViewerEvents = {
  select: (slot: string | undefined) => void;
  hover: (info: { slot: string; x: number; y: number } | undefined) => void;
  pick: (at: Vec3, slot: string | undefined) => void;
  pin: (id: string) => void;
};

// Fog is scaled by model size: `fog` / size gives a light haze at the default camera distance.
const SETTINGS = {
  subsea: { fog: '#123f57', density: 0.42, sky: '#c4ecf7', ground: '#2f4f46', hemisphere: 1.6, light: 2.6 },
  offshore: { fog: '#cfe2ec', density: 0.22, sky: '#ffffff', ground: '#43504f', hemisphere: 1.1, light: 2.4 },
  yard: { fog: '#dde6ea', density: 0.1, sky: '#ffffff', ground: '#4a4f52', hemisphere: 1.1, light: 2.4 },
};

const slotOf = (object: THREE.Object3D | null): string | undefined => {
  for (let node = object; node; node = node.parent) if (node.userData.slot) return node.userData.slot as string;
  return undefined;
};

// Renders on demand: only when the camera moves, the scene changes or a model animates.
export class Viewer {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(42, 1, 0.1, 5000);
  private controls: OrbitControls;
  private hemisphere = new THREE.HemisphereLight('#ffffff', '#444444', 1);
  private sun = new THREE.DirectionalLight('#ffffff', 2);
  private labels = document.createElement('div');
  private pinGroup = new THREE.Group();
  private pinSpecs: PinSpec[] = [];
  private raycaster = new THREE.Raycaster();
  private resizeObserver: ResizeObserver;
  private built?: Built;
  private key?: ModelKey;
  private looks: Record<string, Look> = {};
  private selected?: string;
  private picking = false;
  private dirty = true;
  private frame = 0;
  private last = performance.now();
  private down?: { x: number; y: number };
  private hoverEvent?: PointerEvent;
  private glide?: { from: THREE.Vector3; to: THREE.Vector3; fromTarget: THREE.Vector3; toTarget: THREE.Vector3; t: number };
  private highlight?: THREE.Box3Helper;

  constructor(private host: HTMLElement, private events: ViewerEvents) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.domElement.className = 'viewer-canvas';
    this.labels.className = 'viewer-labels';
    host.append(this.renderer.domElement, this.labels);

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();
    this.scene.environmentIntensity = 0.55;
    this.sun.position.set(0.6, 1, 0.45);
    this.scene.add(this.hemisphere, this.sun, this.pinGroup);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.08;
    this.controls.addEventListener('change', this.invalidate);

    const canvas = this.renderer.domElement;
    canvas.addEventListener('pointerdown', this.onDown);
    canvas.addEventListener('pointerup', this.onUp);
    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerleave', this.onLeave);
    this.resizeObserver = new ResizeObserver(() => this.fit());
    this.resizeObserver.observe(host);
    this.fit();
    this.loop();
  }

  show(key: ModelKey) {
    if (this.key === key && this.built) return;
    this.clearModel();
    const info = MODELS[key];
    const setting = SETTINGS[info.setting];
    this.key = key;
    this.built = buildModel(key);
    this.scene.add(this.built.root);
    this.scene.fog = new THREE.FogExp2(setting.fog, setting.density / info.size);
    this.hemisphere.color.set(setting.sky);
    this.hemisphere.groundColor.set(setting.ground);
    this.hemisphere.intensity = setting.hemisphere;
    this.sun.intensity = setting.light;
    this.camera.near = info.size / 400;
    this.camera.far = info.size * 14;
    this.controls.minDistance = info.size * 0.08;
    this.controls.maxDistance = info.size * 4;
    this.resetView();
    this.applyLooks();
    this.renderPins();
  }

  resetView() {
    if (!this.key) return;
    const info = MODELS[this.key];
    this.glide = undefined;
    this.camera.position.set(...info.camera);
    this.controls.target.set(...info.target);
    this.camera.updateProjectionMatrix();
    this.controls.update();
    this.invalidate();
  }

  // Moves the camera towards a point, keeping the current viewing direction.
  focus(at: Vec3) {
    if (!this.key) return;
    const target = new THREE.Vector3(...at);
    const direction = this.camera.position.clone().sub(this.controls.target).normalize();
    const distance = MODELS[this.key].size * 0.6;
    this.glide = {
      from: this.camera.position.clone(), to: target.clone().add(direction.multiplyScalar(distance)),
      fromTarget: this.controls.target.clone(), toTarget: target, t: 0,
    };
    this.invalidate();
  }

  paint(looks: Record<string, Look>) {
    this.looks = looks;
    this.applyLooks();
  }

  select(slot: string | undefined) {
    this.selected = slot;
    this.applyLooks();
  }

  setPins(pins: PinSpec[]) {
    this.pinSpecs = pins;
    this.renderPins();
  }

  setPicking(on: boolean) {
    this.picking = on;
    this.renderer.domElement.style.cursor = on ? 'crosshair' : '';
  }

  dispose() {
    cancelAnimationFrame(this.frame);
    this.resizeObserver.disconnect();
    this.controls.removeEventListener('change', this.invalidate);
    this.controls.dispose();
    const canvas = this.renderer.domElement;
    canvas.removeEventListener('pointerdown', this.onDown);
    canvas.removeEventListener('pointerup', this.onUp);
    canvas.removeEventListener('pointermove', this.onMove);
    canvas.removeEventListener('pointerleave', this.onLeave);
    this.clearModel();
    this.clearPins();
    this.scene.environment?.dispose();
    this.renderer.dispose();
    canvas.remove();
    this.labels.remove();
  }

  private invalidate = () => {
    this.dirty = true;
  };

  private loop = () => {
    this.frame = requestAnimationFrame(this.loop);
    const now = performance.now();
    const seconds = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    if (this.glide) {
      const glide = this.glide;
      glide.t = Math.min(1, glide.t + seconds * 2.2);
      const eased = 1 - (1 - glide.t) ** 3;
      this.camera.position.lerpVectors(glide.from, glide.to, eased);
      this.controls.target.lerpVectors(glide.fromTarget, glide.toTarget, eased);
      if (glide.t >= 1) this.glide = undefined;
      this.dirty = true;
    }
    const moved = this.controls.update();
    if (this.built?.tick) {
      this.built.tick(seconds);
      this.dirty = true;
    }
    if (this.hoverEvent) this.hoverNow();
    if (moved || this.dirty) {
      this.renderer.render(this.scene, this.camera);
      this.placeLabels();
      this.dirty = false;
    }
  };

  private fit() {
    const width = Math.max(1, this.host.clientWidth);
    const height = Math.max(1, this.host.clientHeight);
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.invalidate();
  }

  private meshesOf(group: THREE.Object3D) {
    const meshes: THREE.Mesh[] = [];
    group.traverse((node) => {
      if (node instanceof THREE.Mesh && !node.userData.glow) meshes.push(node);
    });
    return meshes;
  }

  private applyLooks() {
    if (!this.built) return;
    for (const [slot, group] of this.built.parts) {
      const look = this.looks[slot] ?? {};
      const chosen = slot === this.selected;
      for (const mesh of this.meshesOf(group)) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        const baseOpacity = mesh.userData.baseOpacity as number;
        material.color.set(look.color ?? (mesh.userData.baseColor as string));
        const opacity = look.ghost ? Math.min(baseOpacity, 0.14) : baseOpacity;
        material.opacity = opacity;
        material.transparent = opacity < 1;
        material.depthWrite = opacity >= 1;
        material.emissive.set(chosen ? '#ffffff' : '#000000');
        material.emissiveIntensity = chosen ? 0.12 : 0;
        material.needsUpdate = true;
      }
    }
    this.outline();
    this.invalidate();
  }

  // A box around the selected part keeps its own colour readable in every mode.
  private outline() {
    if (this.highlight) {
      this.scene.remove(this.highlight);
      this.highlight.geometry.dispose();
      (this.highlight.material as THREE.Material).dispose();
      this.highlight = undefined;
    }
    const group = this.selected ? this.built?.parts.get(this.selected) : undefined;
    if (!group) return;
    const bounds = new THREE.Box3().setFromObject(group);
    if (bounds.isEmpty()) return;
    bounds.expandByScalar(MODELS[this.key as ModelKey].size * 0.006);
    this.highlight = new THREE.Box3Helper(bounds, '#1f9bd8');
    (this.highlight.material as THREE.LineBasicMaterial).depthTest = false;
    this.highlight.renderOrder = 9;
    this.scene.add(this.highlight);
  }

  private clearModel() {
    if (!this.built) return;
    this.selected = undefined;
    this.outline();
    this.scene.remove(this.built.root);
    this.built.root.traverse((node) => {
      if (node instanceof THREE.Mesh) {
        node.geometry.dispose();
        (node.material as THREE.Material).dispose();
      }
    });
    this.built = undefined;
    this.key = undefined;
  }

  private clearPins() {
    for (const child of [...this.pinGroup.children]) {
      const mesh = child as THREE.Mesh;
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
      this.pinGroup.remove(mesh);
    }
    this.labels.replaceChildren();
  }

  private renderPins() {
    this.clearPins();
    if (!this.key) return;
    const radius = MODELS[this.key].size * 0.011;
    for (const spec of this.pinSpecs) {
      const material = new THREE.MeshBasicMaterial({ color: spec.color, depthTest: false, transparent: true, opacity: 0.95 });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(spec.selected ? radius * 1.5 : radius, 20, 14), material);
      mesh.position.set(...spec.at);
      mesh.renderOrder = 10;
      mesh.userData.pin = spec.id;
      this.pinGroup.add(mesh);
      const label = document.createElement('span');
      label.className = spec.selected ? 'pin-label selected' : 'pin-label';
      label.textContent = spec.label;
      label.style.borderColor = spec.color;
      this.labels.append(label);
    }
    this.invalidate();
  }

  private placeLabels() {
    const width = this.host.clientWidth;
    const height = this.host.clientHeight;
    const point = new THREE.Vector3();
    this.pinGroup.children.forEach((mesh, index) => {
      const label = this.labels.children[index] as HTMLElement | undefined;
      if (!label) return;
      point.copy(mesh.position).project(this.camera);
      const visible = point.z < 1;
      label.style.display = visible ? '' : 'none';
      label.style.transform = `translate(${((point.x + 1) / 2) * width + 10}px, ${((1 - point.y) / 2) * height - 22}px)`;
    });
  }

  private cast(event: PointerEvent) {
    const rect = this.renderer.domElement.getBoundingClientRect();
    const pointer = new THREE.Vector2(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(pointer, this.camera);
    const pin = this.raycaster.intersectObjects(this.pinGroup.children, false)[0];
    const parts = this.built ? [...this.built.parts.values()] : [];
    const hit = this.raycaster.intersectObjects(parts, true).find((candidate) => !candidate.object.userData.glow);
    return { pin: pin?.object.userData.pin as string | undefined, hit, rect };
  }

  private onDown = (event: PointerEvent) => {
    this.down = { x: event.clientX, y: event.clientY };
  };

  private onUp = (event: PointerEvent) => {
    const down = this.down;
    this.down = undefined;
    if (!down || Math.hypot(event.clientX - down.x, event.clientY - down.y) > 5) return;
    const { pin, hit } = this.cast(event);
    if (this.picking) {
      if (hit) this.events.pick([hit.point.x, hit.point.y, hit.point.z], slotOf(hit.object));
      return;
    }
    if (pin) this.events.pin(pin);
    else this.events.select(hit ? slotOf(hit.object) : undefined);
  };

  private onMove = (event: PointerEvent) => {
    if (event.buttons) return;
    this.hoverEvent = event;
  };

  private onLeave = () => {
    this.hoverEvent = undefined;
    this.events.hover(undefined);
  };

  private hoverNow() {
    const event = this.hoverEvent as PointerEvent;
    this.hoverEvent = undefined;
    const { hit, rect } = this.cast(event);
    const slot = hit ? slotOf(hit.object) : undefined;
    if (!this.picking) this.renderer.domElement.style.cursor = slot ? 'pointer' : '';
    this.events.hover(slot ? { slot, x: event.clientX - rect.left, y: event.clientY - rect.top } : undefined);
  }
}
