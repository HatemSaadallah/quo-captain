import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import '../product3d.css';

type Kind = 'windscreen' | 'balustrade' | 'handrail' | 'divider' | 'door' | 'balcony' | 'deck' | 'other';

interface Props {
  kind: string;
  /** Millimetres; missing values fall back to typical sizes for the typology. */
  L: number | null;
  H: number | null;
  title: string;
  onClose: () => void;
}

const DEFAULTS: Record<Kind, [number, number]> = { windscreen: [2560, 1450], balustrade: [2560, 1100], handrail: [3000, 1100], divider: [1850, 2000], door: [1800, 2100], balcony: [2560, 1600], deck: [3800, 1600], other: [2000, 1200] };

/** Parametric 3D model of a product, built from its own dimensions, optionally on a cruise-ship deck. */
export function Product3D({ kind, L, H, title, onClose }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const [onShip, setOnShip] = useState(true);
  const KINDS: readonly string[] = ['windscreen', 'balustrade', 'handrail', 'divider', 'door', 'balcony', 'deck'];
  const k: Kind = KINDS.includes(kind) ? (kind as Kind) : 'other';
  const [dl, dh] = DEFAULTS[k];
  const w = Math.min(Math.max((L ?? dl) / 1000, 0.6), 12);
  const h = Math.min(Math.max((H ?? dh) / 1000, 0.4), 4);

  useEffect(() => {
    const el = mount.current;
    if (!el) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(el.clientWidth, el.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    el.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(onShip ? '#9fd1ec' : '#eef3f4');
    if (onShip) scene.fog = new THREE.Fog('#bfe0f0', 30, 140);
    const camera = new THREE.PerspectiveCamera(42, el.clientWidth / el.clientHeight, 0.1, 400);
    camera.position.set(w * 0.9 + 2.5, h + 1.6, w * 0.9 + 3.2);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0, h / 2, 0);
    controls.enableDamping = true;
    controls.minDistance = 1.5;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI * 0.49;
    controls.autoRotate = !reduce;
    controls.autoRotateSpeed = 0.6;

    scene.add(new THREE.HemisphereLight('#ffffff', '#5b7a86', 1.1));
    const sun = new THREE.DirectionalLight('#fff3dc', 2.2);
    sun.position.set(6, 10, 4);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    scene.add(sun);

    // Materials
    const glass = new THREE.MeshStandardMaterial({ color: '#9fd4dc', roughness: 0.05, metalness: 0.1, transparent: true, opacity: 0.32, side: THREE.DoubleSide, depthWrite: false });
    const steel = new THREE.MeshStandardMaterial({ color: '#d5dcdf', metalness: 0.35, roughness: 0.3 });
    const alu = new THREE.MeshStandardMaterial({ color: '#e7ecee', metalness: 0.25, roughness: 0.4 });
    const teak = new THREE.MeshStandardMaterial({ color: '#a8743f', roughness: 0.75 });
    const hullWhite = new THREE.MeshStandardMaterial({ color: '#f7f8f8', roughness: 0.6 });
    const box = (sx: number, sy: number, sz: number, m: THREE.Material, x: number, y: number, z: number): THREE.Mesh => {
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, sz), m);
      mesh.position.set(x, y, z);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      scene.add(mesh);
      return mesh;
    };
    const tube = (len: number, r: number, m: THREE.Material, x: number, y: number, z: number, horizontal = false): void => {
      const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, len, 20), m);
      mesh.position.set(x, y, z);
      if (horizontal) mesh.rotation.z = Math.PI / 2;
      mesh.castShadow = true;
      scene.add(mesh);
    };

    // Setting: teak deck, superstructure and sea, or a plain studio floor
    if (onShip) {
      const deckW = Math.max(w + 8, 14);
      box(deckW, 0.25, 9, teak, 0, -0.125, -2);
      for (let x = -deckW / 2; x < deckW / 2; x += 0.14) box(0.006, 0.252, 9, new THREE.MeshStandardMaterial({ color: '#6f4a26' }), x, -0.125, -2);
      box(deckW, 0.6, 0.15, hullWhite, 0, -0.42, 2.48);
      box(deckW, 6, 0.4, hullWhite, 0, 3, -6.5);
      for (let i = -3; i <= 3; i++) box(1.4, 1.1, 0.05, new THREE.MeshStandardMaterial({ color: '#2b4d5c', metalness: 0.4, roughness: 0.2 }), i * 2.2, 2.2, -6.28);
      box(deckW, 0.18, 0.5, new THREE.MeshStandardMaterial({ color: '#1d3a4a' }), 0, 5.2, -6.3);
      const sea = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ color: '#1f6d93', roughness: 0.35, metalness: 0.1 }));
      sea.rotation.x = -Math.PI / 2;
      sea.position.y = -9;
      scene.add(sea);
      // two loungers for scale (about 2 m long)
      for (const lx of [-2.6, 2.4]) {
        box(0.7, 0.35, 1.9, new THREE.MeshStandardMaterial({ color: '#f1efe8' }), lx, 0.18, -3.6);
        box(0.7, 0.05, 0.6, new THREE.MeshStandardMaterial({ color: '#2a6f7a' }), lx, 0.55, -4.35).rotation.x = -0.6;
      }
    } else {
      const floor = new THREE.Mesh(new THREE.CircleGeometry(Math.max(w, 4) * 1.2, 64), new THREE.MeshStandardMaterial({ color: '#e1e8ea' }));
      floor.rotation.x = -Math.PI / 2;
      floor.receiveShadow = true;
      scene.add(floor);
    }

    // The product, at the deck edge (z = 2.3), built from its dimensions
    const z = onShip ? 2.3 : 0;
    const panels = Math.max(1, Math.round(w / 1.3));
    const pw = w / panels;
    const glassRow = (height: number, withHandrail: boolean): void => {
      for (let i = 0; i < panels; i++) box(pw - 0.03, height - 0.12, 0.024, glass, -w / 2 + pw * (i + 0.5), height / 2 + 0.06, z);
      for (let i = 0; i <= panels; i++) box(0.05, height, 0.05, steel, -w / 2 + pw * i, height / 2, z);
      box(w, 0.05, 0.07, steel, 0, 0.04, z);
      if (withHandrail) tube(w + 0.05, 0.025, steel, 0, height + 0.03, z, true);
    };
    if (k === 'windscreen') glassRow(h, false);
    else if (k === 'balustrade') glassRow(Math.min(h, 1.3), true);
    else if (k === 'handrail') {
      for (let i = 0; i <= panels; i++) tube(h, 0.02, steel, -w / 2 + pw * i, h / 2, z);
      tube(w, 0.025, steel, 0, h, z, true);
      tube(w, 0.012, steel, 0, h * 0.5, z, true);
    } else if (k === 'divider') {
      const dz = onShip ? 0.4 : 0;
      box(0.05, h, w, alu, 0, h / 2, dz - 0.02);
      box(0.026, h - 0.1, w - 0.1, glass, 0.02, h / 2, dz - 0.02);
      box(0.06, h, 0.06, steel, 0, h / 2, dz - w / 2);
      box(0.06, h, 0.06, steel, 0, h / 2, dz + w / 2 - 0.04);
    } else if (k === 'door') {
      const dz = onShip ? -6.25 : 0;
      box(w + 0.12, 0.08, 0.14, alu, 0, h + 0.04, dz);
      box(w + 0.12, 0.04, 0.14, alu, 0, 0.02, dz);
      box(0.06, h, 0.14, alu, -w / 2 - 0.03, h / 2, dz);
      box(0.06, h, 0.14, alu, w / 2 + 0.03, h / 2, dz);
      box(w / 2, h - 0.08, 0.03, glass, -w / 4, h / 2, dz + 0.03);
      box(w / 2, h - 0.08, 0.03, glass, w / 4 - 0.15, h / 2, dz + 0.07);
      box(0.03, h - 0.1, 0.05, alu, 0.0, h / 2, dz + 0.05);
    } else if (k === 'balcony') {
      const depth = Math.min(h, 3);
      box(w, 0.18, depth, alu, 0, -0.09, z - depth / 2 + 0.2);
      box(w - 0.04, 0.02, depth - 0.04, teak, 0, 0.01, z - depth / 2 + 0.2);
      const saveZ = z;
      for (let i = 0; i < panels; i++) box(pw - 0.03, 0.98, 0.024, glass, -w / 2 + pw * (i + 0.5), 0.56, saveZ + 0.2);
      tube(w, 0.025, steel, 0, 1.1, saveZ + 0.2, true);
      box(0.04, 1.1, depth, alu, -w / 2, 0.55, z - depth / 2 + 0.2);
      box(0.04, 1.1, depth, alu, w / 2, 0.55, z - depth / 2 + 0.2);
    } else if (k === 'deck') {
      const depth = Math.min(h, 4);
      for (let x = -w / 2; x < w / 2; x += 0.15) box(0.13, 0.04, depth, teak, x + 0.075, 0.03, z - depth / 2);
      box(w, 0.02, depth, new THREE.MeshStandardMaterial({ color: '#3b2a1a' }), 0, 0.005, z - depth / 2);
    } else {
      box(w, h, 0.08, alu, 0, h / 2, z);
    }

    // Dimension line under the product for scale
    const dim = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(-w / 2, 0.02, z + 0.35), new THREE.Vector3(w / 2, 0.02, z + 0.35)]), new THREE.LineBasicMaterial({ color: '#00939b' }));
    scene.add(dim);

    let frame = 0;
    const tick = (): void => {
      controls.update();
      renderer.render(scene, camera);
      frame = requestAnimationFrame(tick);
    };
    tick();
    const onResize = (): void => {
      camera.aspect = el.clientWidth / el.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(el.clientWidth, el.clientHeight);
    };
    window.addEventListener('resize', onResize);
    const stop = (): void => {
      controls.autoRotate = false;
    };
    renderer.domElement.addEventListener('pointerdown', stop);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', onResize);
      renderer.domElement.removeEventListener('pointerdown', stop);
      controls.dispose();
      scene.traverse((o) => {
        if (o instanceof THREE.Mesh) {
          o.geometry.dispose();
          (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose());
        }
      });
      renderer.dispose();
      el.removeChild(renderer.domElement);
    };
  }, [k, w, h, onShip]);

  return (
    <div className="p3d-backdrop" role="presentation" onClick={(e) => e.target === e.currentTarget && onClose()} onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <section className="p3d" role="dialog" aria-modal="true" aria-label={`3D view of ${title}`}>
        <header className="p3d-head">
          <div>
            <h2>{title}</h2>
            <p>
              {(w * 1000).toFixed(0)} × {(h * 1000).toFixed(0)} mm · drag to rotate, scroll to zoom
            </p>
          </div>
          <div className="p3d-tools">
            <div className="p3d-toggle" role="tablist" aria-label="Scene">
              <button role="tab" aria-selected={onShip} className={onShip ? 'on' : ''} onClick={() => setOnShip(true)}>
                On a cruise deck
              </button>
              <button role="tab" aria-selected={!onShip} className={!onShip ? 'on' : ''} onClick={() => setOnShip(false)}>
                Product only
              </button>
            </div>
            <button className="p3d-close" onClick={onClose} aria-label="Close 3D view" autoFocus>
              ×
            </button>
          </div>
        </header>
        <div className="p3d-canvas" ref={mount} />
        <p className="p3d-note">Illustrative model generated from the product's typology and dimensions, not a CAD drawing.</p>
      </section>
    </div>
  );
}
