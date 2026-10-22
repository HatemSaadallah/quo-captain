import * as THREE from 'three';
import type { ProductSpec } from './product3d-scene';

/** Illustrative vessel around the actual-size product, with the selected installation at the origin. */
export function createCruiseSetting(spec: ProductSpec, steel: THREE.Material) {
  const ship = new THREE.Group(); ship.name = 'cruise-ship';
  const seaLevel = -11.5;
  const length = Math.max(94, spec.width * 12);
  const beam = Math.max(22, spec.dimension + 14);
  const front = spec.kind === 'door' ? 3.2 : spec.horizontal ? spec.dimension / 2 : .08;
  const cabin = spec.kind === 'door' ? -.12 : spec.horizontal ? -spec.dimension / 2 - .1 : -3.1;
  const centerZ = front - beam / 2;
  const white = new THREE.MeshStandardMaterial({ color: '#f3f5f3', roughness: .62 });
  const navy = new THREE.MeshStandardMaterial({ color: '#183b52', roughness: .5 });
  const window = new THREE.MeshStandardMaterial({ color: '#3a6373', roughness: .22, metalness: .3 });
  const glazing = new THREE.MeshStandardMaterial({ color: '#a4c5cc', roughness: .2, metalness: .1, transparent: true, opacity: .62 });
  const orange = new THREE.MeshStandardMaterial({ color: '#e99b39', roughness: .5 });
  const paleWood = new THREE.MeshStandardMaterial({ color: '#c5b18d', roughness: .85 });
  const blue = new THREE.MeshPhysicalMaterial({ color: '#44a8bb', roughness: .15, metalness: .15, clearcoat: .8 });
  type Box = { size: [number, number, number]; at: [number, number, number] };
  const batches = new Map<THREE.Material, Box[]>();
  const box = (material: THREE.Material, size: Box['size'], at: Box['at']): void => {
    const batch = batches.get(material) ?? []; batch.push({ size, at }); batches.set(material, batch);
  };
  const hullShape = (len: number, breadth: number, outer: number): THREE.Shape => {
    const zMid = outer - breadth / 2;
    const shape = new THREE.Shape();
    shape.moveTo(-len * .46, -outer + 1.5);
    shape.quadraticCurveTo(-len * .46, -outer, -len * .42, -outer);
    shape.lineTo(len * .27, -outer);
    shape.bezierCurveTo(len * .39, -outer, len * .50, -zMid - breadth * .22, len * .54, -zMid);
    shape.bezierCurveTo(len * .50, -zMid + breadth * .22, len * .39, -outer + breadth, len * .27, -outer + breadth);
    shape.lineTo(-len * .42, -outer + breadth);
    shape.quadraticCurveTo(-len * .46, -outer + breadth, -len * .46, -outer + breadth - 1.5);
    shape.closePath(); return shape;
  };
  const level = (shape: THREE.Shape, top: number, height: number, material: THREE.Material): void => {
    const geometry = new THREE.ExtrudeGeometry(shape, { depth: height, bevelEnabled: false, curveSegments: 20 }); geometry.rotateX(-Math.PI / 2);
    const mesh = new THREE.Mesh(geometry, material); mesh.position.y = top - height; mesh.castShadow = true; mesh.receiveShadow = true; ship.add(mesh);
  };
  const outline = hullShape(length, beam, front - .12);
  level(outline, -6.25, 6.4, white);
  level(hullShape(length * 1.001, beam + .04, front - .10), -9.8, .7, navy);
  level(outline, -12, .8, navy);
  level(outline, -6.19, .07, paleWood);
  // The cabin block is set back from the pointed bow and curved stern.
  const cabinLength = length * .71;
  const cabinBack = front - beam + 1.3;
  box(white, [cabinLength, 16.2, cabin - cabinBack], [-length * .025, 1.85, (cabin + cabinBack) / 2]);
  const roomPitch = Math.max(2.9, Math.min(4.2, spec.width + .25));
  const rooms = Math.floor(cabinLength / roomPitch);
  const selectedLeft = -spec.width / 2 - .06; const selectedRight = spec.width / 2 + .06;
  for (const y of [-3.2, 0, 3.2, 6.4]) {
    for (let i = -Math.floor(rooms / 2); i <= Math.floor(rooms / 2); i++) {
      const x = i * roomPitch; const overlaps = x + roomPitch / 2 > selectedLeft && x - roomPitch / 2 < selectedRight;
      const selected = y === 0 && overlaps;
      if (!(spec.kind === 'door' && selected)) {
        box(window, [roomPitch * .72, 2.12, .045], [x, y + 1.22, cabin + .035]);
        box(white, [.045, 2.16, .08], [x, y + 1.22, cabin + .07]);
      }
      // Leave the exact product bay open instead of placing a duplicate rail in front of it.
      if (!selected || !spec.horizontal) box(white, [roomPitch, .17, front - cabin], [x, y - .115, (front + cabin) / 2]);
      if (!selected) {
        box(paleWood, [roomPitch - .05, .015, front - cabin - .06], [x, y - .02, (front + cabin) / 2]);
        box(glazing, [roomPitch - .07, .92, .025], [x, y + .55, front]);
        box(white, [roomPitch, .045, .065], [x, y + 1.06, front]);
        box(white, [.045, 1.06, .045], [x + roomPitch / 2, y + .52, front]);
        box(white, [.055, 1.75, front - cabin], [x + roomPitch / 2, y + .84, (front + cabin) / 2]);
      }
      // Cabin windows on the opposite side help the overview read as a complete vessel.
      box(window, [roomPitch * .7, 1.85, .035], [x, y + 1.2, cabinBack - .02]);
    }
  }
  // Door threshold / connection to the selected balcony's cabin.
  if (spec.kind === 'balcony' || spec.kind === 'deck') box(white, [spec.width, .16, .25], [0, -.10, cabin + .07]);
  // Long horizontal deck bands and the upper promenade.
  for (const y of [-3.32, 3.08, 6.28, 9.5]) box(white, [cabinLength + .5, .18, front - cabinBack + .5], [-length * .025, y, (front + cabinBack) / 2]);
  box(paleWood, [cabinLength + .3, .035, front - cabinBack + .3], [-length * .025, 9.61, (front + cabinBack) / 2]);
  for (const z of [front + .2, cabinBack - .2]) {
    box(glazing, [cabinLength + .4, .95, .035], [-length * .025, 10.13, z]);
    box(white, [cabinLength + .6, .06, .07], [-length * .025, 10.64, z]);
    for (let x = -cabinLength / 2; x < cabinLength / 2; x += 2) box(white, [.045, 1.02, .045], [x, 10.12, z]);
  }
  // Bridge, pool deck, funnel and radar domes form the recognizable cruise silhouette.
  box(white, [9, 2.45, beam * .83], [length * .275, 10.9, centerZ]);
  box(window, [9.1, .95, beam * .84], [length * .275, 11.45, centerZ]);
  box(white, [10.2, .22, beam * .91], [length * .275, 12.12, centerZ]);
  box(white, [11, .32, 5.6], [length * .06, 9.8, centerZ]);
  box(blue, [9.7, .06, 4.5], [length * .06, 10, centerZ]);
  for (let i = 0; i < 7; i++) for (const sign of [-1, 1]) {
    box(white, [.7, .16, 1.9], [length * .06 - 4.5 + i * 1.4, 9.85, centerZ + sign * 4.3]);
    box(glazing, [.65, .07, 1.75], [length * .06 - 4.5 + i * 1.4, 9.96, centerZ + sign * 4.3]);
  }
  box(white, [8, 1.8, 6], [-length * .22, 10.5, centerZ]);
  const funnel = new THREE.Mesh(new THREE.CylinderGeometry(2.05, 2.65, 3.8, 4), navy); funnel.rotation.y = Math.PI / 4; funnel.scale.z = .8; funnel.position.set(-length * .22, 13, centerZ); funnel.castShadow = true; ship.add(funnel);
  for (const x of [-length * .22 - .8, -length * .22 + .8]) {
    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(.45, .45, .5, 16), window); exhaust.position.set(x, 15.1, centerZ); ship.add(exhaust);
  }
  for (const x of [length * .20, -length * .34]) {
    const dome = new THREE.Mesh(new THREE.SphereGeometry(.95, 20, 16), white); dome.position.set(x, 11.1, centerZ); ship.add(dome);
    box(white, [.4, 1.1, .4], [x, 10.1, centerZ]);
  }
  box(white, [.12, 3.5, .12], [length * .32, 13.7, centerZ]);
  box(steel, [3, .12, .12], [length * .32, 14.7, centerZ]);
  // Enclosed orange lifeboats sit on davits, below the balcony decks.
  for (let x = -length * .32; x < length * .29; x += 8) {
    const boat = new THREE.Mesh(new THREE.CapsuleGeometry(.62, 3.8, 5, 14), orange); boat.rotation.z = Math.PI / 2; boat.scale.z = .83; boat.position.set(x, -4.8, front + .65); boat.castShadow = true; ship.add(boat);
    box(white, [3.3, .47, .84], [x, -4.34, front + .65]);
    box(window, [3, .20, .86], [x, -4.25, front + .65]);
    for (const dx of [-1.6, 1.6]) { box(white, [.12, 1.6, .12], [x + dx, -4.7, front - .25]); box(white, [.12, .12, 1.4], [x + dx, -3.95, front + .34]); }
  }
  // A porthole row on the hull provides scale at the waterline.
  const portGeometry = new THREE.CylinderGeometry(.25, .25, .06, 16);
  for (let x = -length * .37; x < length * .28; x += 2.2) {
    const port = new THREE.Mesh(portGeometry, window); port.rotation.x = Math.PI / 2; port.position.set(x, -8.15, front - .075); ship.add(port);
  }
  for (const [material, boxes] of batches) {
    const mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), material, boxes.length);
    const transform = new THREE.Object3D();
    boxes.forEach(({ size, at }, index) => { transform.position.set(...at); transform.scale.set(...size); transform.updateMatrix(); mesh.setMatrixAt(index, transform.matrix); });
    mesh.instanceMatrix.needsUpdate = true; mesh.castShadow = material !== glazing; mesh.receiveShadow = true; mesh.computeBoundingBox(); ship.add(mesh);
  }
  const bounds = new THREE.Box3().setFromObject(ship);
  // Small directional waves give the sea texture without a time-dependent shader.
  const pixels = new Uint8Array(128 * 128 * 4);
  for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) {
    const offset = (y * 128 + x) * 4;
    const u = x / 128 * Math.PI * 2; const v = y / 128 * Math.PI * 2;
    pixels[offset] = 128 + Math.round(24 * Math.sin(u * 4 + Math.sin(v * 2)));
    pixels[offset + 1] = 128 + Math.round(32 * Math.cos(v * 7 + Math.sin(u * 3)));
    pixels[offset + 2] = 248; pixels[offset + 3] = 255;
  }
  const normalMap = new THREE.DataTexture(pixels, 128, 128); normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping; normalMap.repeat.set(140, 140); normalMap.needsUpdate = true;
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(2500, 2500), new THREE.MeshStandardMaterial({ color: '#357b96', roughness: .27, metalness: .24, normalMap, normalScale: new THREE.Vector2(.4, .4) })); ocean.name = 'ocean'; ocean.rotation.x = -Math.PI / 2; ocean.position.y = seaLevel;
  const wake = new THREE.Group(); wake.name = 'wake';
  const foam = new THREE.LineBasicMaterial({ color: '#d8eeee', transparent: true, opacity: .34 });
  for (let i = 0; i < 7; i++) {
    const points = Array.from({ length: 80 }, (_, j) => {
      const x = -length * .54 + j / 79 * length * .77;
      return new THREE.Vector3(x, seaLevel + .025, front + .6 + i * .24 + .15 * Math.sin(j * .4 + i));
    });
    wake.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), foam));
  }
  // Keep a subtle boundary around the selected bay in the ship-wide view.
  const selected = new THREE.Group(); selected.name = 'selected-installation';
  const borderMaterial = new THREE.LineBasicMaterial({ color: '#36d3c5', depthTest: false, transparent: true, opacity: .9 });
  const zRear = spec.horizontal ? -spec.dimension / 2 : -.15;
  const zFront = spec.horizontal ? spec.dimension / 2 : .15;
  const corners = [new THREE.Vector3(-spec.width / 2, .04, zRear), new THREE.Vector3(spec.width / 2, .04, zRear), new THREE.Vector3(spec.width / 2, .04, zFront), new THREE.Vector3(-spec.width / 2, .04, zFront)];
  selected.add(new THREE.LineLoop(new THREE.BufferGeometry().setFromPoints(corners), borderMaterial));
  return { ship, ocean, wake, selected, bounds };
}
