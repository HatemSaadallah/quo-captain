import * as THREE from 'three';
import { createCruiseSetting } from './cruise-setting';

export type ProductKind = 'windscreen' | 'balustrade' | 'handrail' | 'divider' | 'door' | 'balcony' | 'deck' | 'other';
const defaults: Record<ProductKind, [number, number]> = { windscreen: [2560, 1450], balustrade: [2560, 1100], handrail: [3000, 1100], divider: [1850, 2000], door: [1800, 2100], balcony: [2560, 1600], deck: [3800, 1600], other: [2000, 1200] };
export function productSpec(kind: string, length: number | null, height: number | null, title: string, moduleMm?: number | null) {
  const k: ProductKind = Object.hasOwn(defaults, kind) ? kind as ProductKind : 'other';
  const valid = (value: number | null): value is number => value !== null && Number.isFinite(value) && value > 0;
  const horizontal = k === 'balcony' || k === 'deck';
  const trapezoid = k === 'balcony' && /trapez/i.test(title);
  const inclined = /inclin/i.test(title);
  const angle = /([0-9]+(?:[.,][0-9]+)?)\s*°/.exec(title)?.[1];
  return { kind: k, width: (valid(length) ? length : defaults[k][0]) / 1000, dimension: (valid(height) ? height : defaults[k][1]) / 1000,
    horizontal, inferredSize: !valid(length) || !valid(height), trapezoid,
    curved: !trapezoid && /curv|facet|shaped/i.test(title), incline: inclined ? Math.min(60, Number(angle?.replace(',', '.') ?? 20)) : 0,
    inferredIncline: inclined && !angle, moduleWidth: valid(moduleMm ?? null) ? moduleMm! / 1000 : 1.15 };
}
export type ProductSpec = ReturnType<typeof productSpec>;

function deckTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas'); canvas.width = canvas.height = 512;
  const ctx = canvas.getContext('2d')!;
  const shades = ['#b69a76', '#bba17d', '#b7a080', '#c1a886', '#b89e79', '#c3aa88', '#bda380', '#b29a77'];
  for (let board = 0; board < 8; board++) {
    ctx.fillStyle = shades[board]; ctx.fillRect(board * 64, 0, 64, 512);
    ctx.fillStyle = '#776c5d'; ctx.fillRect(board * 64, 0, 2, 512);
    for (let line = 0; line < 13; line++) {
      ctx.strokeStyle = line % 2 ? '#584b3612' : '#f3ddba18'; ctx.lineWidth = .5;
      ctx.beginPath(); ctx.moveTo(board * 64 + 5 + line * 4.5, 0); ctx.bezierCurveTo(board * 64 + 10 + line * 4, 180, board * 64 + line * 4, 330, board * 64 + 5 + line * 4.5, 512); ctx.stroke();
    }
    ctx.fillStyle = '#776c5d80'; ctx.fillRect(board * 64, (board % 3) * 170, 64, 1);
  }
  const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace; texture.wrapS = texture.wrapT = THREE.RepeatWrapping; texture.repeat.set(1, 1); texture.anisotropy = 8;
  return texture;
}

export function createProductScene(spec: ProductSpec, onShip: boolean) {
  // The studio follows the page theme when the viewer opens; the ship keeps its daylight sky.
  const studio = document.documentElement.dataset.theme === 'dark' ? { sky: '#1b2225', floor: '#232c2f' } : { sky: '#edf0f0', floor: '#e7edeb' };
  const scene = new THREE.Scene(); scene.background = new THREE.Color(onShip ? '#dce8ed' : studio.sky);
  if (onShip) scene.fog = new THREE.Fog('#dce8ed', 100, 1100);
  const product = new THREE.Group(); product.name = 'product'; scene.add(product);
  const setting = new THREE.Group(); setting.name = 'setting'; scene.add(setting);
  const woodTexture = deckTexture();
  const steel = new THREE.MeshStandardMaterial({ color: '#d8e1e1', metalness: .82, roughness: .26 });
  const aluminium = new THREE.MeshStandardMaterial({ color: '#eff3f1', metalness: .4, roughness: .32 });
  const glass = new THREE.MeshPhysicalMaterial({ color: '#a4d0cc', roughness: .12, metalness: .02, transmission: .22, thickness: .018, ior: 1.45, transparent: true, opacity: .48, side: THREE.DoubleSide, depthWrite: false });
  const frostedGlass = glass.clone(); frostedGlass.roughness = .42; frostedGlass.opacity = .42; frostedGlass.transmission = .1;
  const wood = new THREE.MeshStandardMaterial({ map: woodTexture, color: '#e3dbcc', roughness: .82, side: THREE.DoubleSide });
  const rubber = new THREE.MeshStandardMaterial({ color: '#405858', roughness: .85 });
  const box = (group: THREE.Group, size: [number, number, number], pos: [number, number, number], material: THREE.Material): THREE.Mesh => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(...size), material); mesh.position.set(...pos); mesh.castShadow = material !== glass && material !== frostedGlass; mesh.receiveShadow = true; group.add(mesh); return mesh;
  };
  const beam = (group: THREE.Group, a: THREE.Vector3, b: THREE.Vector3, radius: number, material = steel): void => {
    const delta = b.clone().sub(a); const mesh = new THREE.Mesh(new THREE.CylinderGeometry(radius, radius, delta.length(), 16), material);
    mesh.position.copy(a).add(b).multiplyScalar(.5); mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), delta.normalize()); mesh.castShadow = true; group.add(mesh);
  };
  const panel = (a: THREE.Vector3, b: THREE.Vector3, height: number, bottom: number, material: THREE.Material): void => {
    const distance = a.distanceTo(b); const mesh = box(product, [Math.max(.01, distance - .055), height, .016], [(a.x + b.x) / 2, bottom + height / 2, (a.z + b.z) / 2], material);
    mesh.rotation.y = -Math.atan2(b.z - a.z, b.x - a.x);
    const edge = new THREE.LineSegments(new THREE.EdgesGeometry(mesh.geometry), new THREE.LineBasicMaterial({ color: '#719d9b', transparent: true, opacity: .38 })); mesh.add(edge);
  };
  const railing = (a: THREE.Vector3, b: THREE.Vector3, height: number, handrail = true, opaque = false): void => {
    const count = Math.max(1, Math.min(200, Math.ceil(a.distanceTo(b) / spec.moduleWidth)));
    for (let i = 0; i <= count; i++) {
      const p = a.clone().lerp(b, i / count);
      beam(product, new THREE.Vector3(p.x, .04, p.z), new THREE.Vector3(p.x, height, p.z), .018);
      box(product, [.09, .018, .09], [p.x, .02, p.z], steel);
      if (i < count) {
        const next = a.clone().lerp(b, (i + 1) / count); panel(p, next, height - .18, .12, opaque ? frostedGlass : glass);
        for (const factor of [.14, .86]) { const clamp = p.clone().lerp(next, factor); box(product, [.045, .055, .055], [clamp.x, .14, clamp.z], steel); }
      }
    }
    if (handrail) beam(product, new THREE.Vector3(a.x, height, a.z), new THREE.Vector3(b.x, height, b.z), .026);
    beam(product, new THREE.Vector3(a.x, .065, a.z), new THREE.Vector3(b.x, .065, b.z), .012);
  };
  const w = spec.width; const d = spec.horizontal ? spec.dimension : .12; const h = spec.horizontal ? 1.1 : spec.dimension;
  const halfFront = spec.trapezoid ? w * .40 : w / 2;
  if (spec.kind === 'balcony' || spec.kind === 'deck') {
    const frontPoints = spec.curved ? Array.from({ length: 7 }, (_, i) => new THREE.Vector3(-w / 2 + w * i / 6, 0, d / 2 - d * .14 * (2 * i / 6 - 1) ** 2)) : [new THREE.Vector3(-halfFront, 0, d / 2), new THREE.Vector3(halfFront, 0, d / 2)];
    const shape = new THREE.Shape(); shape.moveTo(-w / 2, d / 2); shape.lineTo(w / 2, d / 2);
    for (const point of [...frontPoints].reverse()) shape.lineTo(point.x, -point.z);
    shape.closePath();
    const slabGeometry = new THREE.ExtrudeGeometry(shape, { depth: .16, bevelEnabled: true, bevelThickness: .008, bevelSize: .008, bevelSegments: 2, steps: 1 }); slabGeometry.rotateX(-Math.PI / 2);
    const slab = new THREE.Mesh(slabGeometry, aluminium); slab.position.y = -.17; slab.castShadow = true; slab.receiveShadow = true; product.add(slab);
    const surfaceGeometry = new THREE.ShapeGeometry(shape); surfaceGeometry.rotateX(-Math.PI / 2);
    const surface = new THREE.Mesh(surfaceGeometry, wood); surface.position.y = .005; surface.receiveShadow = true; product.add(surface);
    for (const x of [-w * .3, 0, w * .3]) box(product, [.075, .11, d * .95], [x, -.20, 0], aluminium);
    if (spec.kind === 'balcony') {
      const rearL = new THREE.Vector3(-w / 2, 0, -d / 2); const rearR = new THREE.Vector3(w / 2, 0, -d / 2);
      const frontL = frontPoints[0]; const frontR = frontPoints[frontPoints.length - 1];
      for (let i = 0; i < frontPoints.length - 1; i++) railing(frontPoints[i], frontPoints[i + 1], 1.1);
      railing(rearL, frontL, 1.1, true, true); railing(frontR, rearR, 1.1, true, true);
    }
  } else if (spec.kind === 'windscreen' || spec.kind === 'balustrade' || spec.kind === 'divider') {
    const segments = spec.curved ? Math.max(3, Math.min(200, Math.ceil(w / spec.moduleWidth))) : 1;
    const point = (i: number): THREE.Vector3 => new THREE.Vector3(-w / 2 + w * i / segments, 0, spec.curved ? w * .15 * (1 - (2 * i / segments - 1) ** 2) : 0);
    for (let i = 0; i < segments; i++) railing(point(i), point(i + 1), h, spec.kind !== 'windscreen', spec.kind === 'divider');
    product.rotation.x = THREE.MathUtils.degToRad(spec.incline);
  } else if (spec.kind === 'handrail') {
    const posts = Math.max(1, Math.ceil(w / 1.2));
    for (let i = 0; i <= posts; i++) { const x = -w / 2 + i * w / posts; beam(product, new THREE.Vector3(x, 0, 0), new THREE.Vector3(x, h, 0), .022); box(product, [.10, .02, .10], [x, .01, 0], steel); }
    for (const y of [h, h * .52, h * .16]) beam(product, new THREE.Vector3(-w / 2, y, 0), new THREE.Vector3(w / 2, y, 0), y === h ? .028 : .014);
  } else if (spec.kind === 'door') {
    for (const x of [-w / 2, w / 2]) box(product, [.065, h, .12], [x, h / 2, 0], aluminium);
    for (const y of [.035, h - .035]) box(product, [w, .07, .14], [0, y, 0], aluminium);
    panel(new THREE.Vector3(-w / 2 + .04, 0, -.025), new THREE.Vector3(0, 0, -.025), h - .15, .075, glass);
    panel(new THREE.Vector3(.015, 0, .025), new THREE.Vector3(w / 2 - .04, 0, .025), h - .15, .075, glass);
    box(product, [.04, h - .08, .055], [0, h / 2, .04], aluminium);
    box(product, [.022, .25, .025], [.08, h * .46, .075], rubber);
  } else {
    box(product, [w, h, .08], [0, h / 2, 0], aluminium);
  }
  const bounds = new THREE.Box3().setFromObject(product);
  const radius = bounds.getBoundingSphere(new THREE.Sphere()).radius;
  const groundY = spec.horizontal ? -.29 : -.025;
  let shipBounds: THREE.Box3 | null = null;
  let installation: THREE.Group | null = null;
  if (onShip) {
    const cruise = createCruiseSetting(spec, steel);
    setting.add(cruise.ship, cruise.ocean, cruise.wake, cruise.selected);
    shipBounds = cruise.bounds; installation = cruise.selected;
  } else {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(radius * 40, radius * 40), new THREE.MeshStandardMaterial({ color: studio.floor, roughness: .93 })); floor.rotation.x = -Math.PI / 2; floor.position.y = groundY; floor.receiveShadow = true; setting.add(floor);
    scene.fog = new THREE.Fog(studio.sky, radius * 5, radius * 16);
  }
  scene.add(new THREE.HemisphereLight('#f5fbff', '#b7b9aa', 1.25));
  const sun = new THREE.DirectionalLight('#fff6e7', 2.6); sun.position.set(-4, 8, 6); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048); sun.shadow.normalBias = .025; sun.shadow.bias = -.00015; sun.shadow.radius = 4;
  const shadowRange = Math.max(radius * 1.5, 5); Object.assign(sun.shadow.camera, { left: -shadowRange, right: shadowRange, top: shadowRange, bottom: -shadowRange, near: .1, far: 60 }); scene.add(sun);
  const fill = new THREE.DirectionalLight('#e5f5ff', .8); fill.position.set(4, 3, -2); scene.add(fill);
  const dimensions = new THREE.Group(); dimensions.name = 'dimensions'; scene.add(dimensions);
  const lineMaterial = new THREE.LineBasicMaterial({ color: '#3e7f80', transparent: true, opacity: .65, depthTest: false });
  const label = (text: string, at: THREE.Vector3): void => {
    const canvas = document.createElement('canvas'); canvas.width = 320; canvas.height = 80; const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#f9fcfb'; ctx.beginPath(); ctx.roundRect(1, 1, 318, 78, 16); ctx.fill(); ctx.strokeStyle = '#c9dcda'; ctx.lineWidth = 2; ctx.stroke(); ctx.font = '500 29px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = '#35666a'; ctx.fillText(text, 160, 40);
    const texture = new THREE.CanvasTexture(canvas); texture.colorSpace = THREE.SRGBColorSpace;
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, depthTest: false, depthWrite: false })); sprite.position.copy(at); const width = Math.max(radius * .55, .55); sprite.scale.set(width, width / 4, 1); sprite.renderOrder = 5; dimensions.add(sprite);
  };
  const dimensionLine = (a: THREE.Vector3, b: THREE.Vector3, text: string): void => {
    dimensions.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([a, b]), lineMaterial));
    for (const p of [a, b]) dimensions.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints([p.clone().add(new THREE.Vector3(0, -.07, 0)), p.clone().add(new THREE.Vector3(0, .07, 0))]), lineMaterial));
    label(text, a.clone().add(b).multiplyScalar(.5));
  };
  const dimZ = spec.horizontal ? d / 2 + .35 : .35;
  dimensionLine(new THREE.Vector3(-w / 2, .06, dimZ), new THREE.Vector3(w / 2, .06, dimZ), `${Math.round(w * 1000).toLocaleString('en-GB')} mm`);
  if (spec.horizontal) dimensionLine(new THREE.Vector3(w / 2 + .4, .06, -d / 2), new THREE.Vector3(w / 2 + .4, .06, d / 2), `${Math.round(d * 1000).toLocaleString('en-GB')} mm`);
  else dimensionLine(new THREE.Vector3(w / 2 + .35, 0, 0), new THREE.Vector3(w / 2 + .35, h, 0), `${Math.round(h * 1000).toLocaleString('en-GB')} mm`);
  return { scene, product, bounds, dimensions, radius, shipBounds, installation };
}

export function disposeScene(scene: THREE.Scene): void {
  const geometries = new Set<THREE.BufferGeometry>(); const materials = new Set<THREE.Material>(); const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    if (object instanceof THREE.Mesh || object instanceof THREE.Line || object instanceof THREE.Sprite) {
      if ('geometry' in object) geometries.add(object.geometry);
      for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
    }
    if (object instanceof THREE.DirectionalLight) object.shadow.dispose();
  });
  for (const material of materials) { for (const value of Object.values(material)) if (value instanceof THREE.Texture) textures.add(value); material.dispose(); }
  for (const geometry of geometries) geometry.dispose();
  for (const texture of textures) texture.dispose();
}
