import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createProductScene, disposeScene, productSpec } from './product3d-scene';
import { Icon } from './Icon';
import '../product3d.css';

type View = 'perspective' | 'front' | 'top' | 'ship' | 'detail';
interface Props { kind: string; L: number | null; H: number | null; title: string; moduleMm?: number | null; onClose: () => void }

export function Product3D({ kind, L, H, title, moduleMm, onClose }: Props) {
  const mount = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLElement>(null);
  const viewControl = useRef<(view: View) => void>(() => undefined);
  const dimensionControl = useRef<THREE.Group | null>(null);
  const orbit = useRef<OrbitControls | null>(null);
  const [onShip, setOnShip] = useState(true);
  const [view, setView] = useState<View | 'custom'>('perspective');
  const [rotating, setRotating] = useState(false);
  const [dimensions, setDimensions] = useState(true);
  const [error, setError] = useState('');
  const spec = useMemo(() => productSpec(kind, L, H, title, moduleMm), [kind, L, H, title, moduleMm]);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    dialog.current?.querySelector<HTMLButtonElement>('.p3d-close')?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);

  useEffect(() => {
    const el = mount.current; if (!el) return;
    setError(''); setRotating(false); setView('perspective');
    let renderer: THREE.WebGLRenderer;
    try { renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false }); }
    catch { setError('The 3D viewer could not start. Enable hardware acceleration in your browser and reopen this view.'); return; }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2)); renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = .95; renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.domElement.tabIndex = 0; renderer.domElement.setAttribute('aria-label', 'Interactive 3D product. Drag to orbit, scroll to zoom, or use arrow keys to rotate.');
    el.appendChild(renderer.domElement);
    const { scene, bounds, dimensions: guides, radius, shipBounds, installation } = createProductScene(spec, onShip);
    const detailBounds = (installation ? new THREE.Box3().setFromObject(installation) : bounds.clone()).union(bounds).expandByScalar(Math.max(1.5, radius * .8));
    dimensionControl.current = guides;
    const environment = new RoomEnvironment(); const pmrem = new THREE.PMREMGenerator(renderer); const envMap = pmrem.fromScene(environment, .04);
    scene.environment = envMap.texture; scene.environmentIntensity = .75; environment.dispose(); pmrem.dispose();
    const center = bounds.getCenter(new THREE.Vector3());
    const camera = new THREE.PerspectiveCamera(38, 1, .02, Math.max(300, radius * 60));
    const controls = new OrbitControls(camera, renderer.domElement); orbit.current = controls;
    controls.target.copy(center); controls.enableDamping = true; controls.dampingFactor = .08; controls.enablePan = false;
    controls.minDistance = radius * 1.25; controls.maxDistance = Math.max(radius * 9, shipBounds ? shipBounds.getBoundingSphere(new THREE.Sphere()).radius * 2.5 : 0);
    controls.minPolarAngle = .015; controls.maxPolarAngle = Math.PI * .485;
    if (onShip) { controls.minAzimuthAngle = -Math.PI * .48; controls.maxAzimuthAngle = Math.PI * .48; }
    controls.autoRotateSpeed = .65;
    let currentView: View = 'perspective'; let touched = false;
    const fit = (next: View): void => {
      currentView = next; touched = false; controls.autoRotate = false; setRotating(false);
      const vertical = THREE.MathUtils.degToRad(camera.fov); const horizontal = 2 * Math.atan(Math.tan(vertical / 2) * camera.aspect);
      const box = next === 'ship' && shipBounds ? shipBounds : next === 'detail' ? detailBounds : bounds; const center = box.getCenter(new THREE.Vector3());
      const direction = (next === 'ship' ? new THREE.Vector3(.9, .55, 1.6) : next === 'detail' ? new THREE.Vector3(.55, .3, 1.5) : next === 'top' ? new THREE.Vector3(0, 1, .015) : next === 'front' ? new THREE.Vector3(0, .18, 1) : new THREE.Vector3(1.05, .8, 1.4)).normalize();
      const right = new THREE.Vector3().crossVectors(new THREE.Vector3(0, 1, 0), direction).normalize();
      const up = new THREE.Vector3().crossVectors(direction, right).normalize();
      const framed = box.clone().expandByScalar(.22);
      let distance = controls.minDistance;
      for (const x of [framed.min.x, framed.max.x]) for (const y of [framed.min.y, framed.max.y]) for (const z of [framed.min.z, framed.max.z]) {
        const corner = new THREE.Vector3(x, y, z).sub(center); const depth = corner.dot(direction);
        distance = Math.max(distance, Math.abs(corner.dot(right)) / Math.tan(horizontal / 2) + depth, Math.abs(corner.dot(up)) / Math.tan(vertical / 2) + depth);
      }
      camera.position.copy(center).add(direction.multiplyScalar(distance * 1.16)); controls.target.copy(center); controls.update();
    };
    viewControl.current = (next) => { setView(next); fit(next); };
    const resize = (): void => {
      const width = el.clientWidth; const height = el.clientHeight; if (!width || !height) return;
      camera.aspect = width / height; camera.updateProjectionMatrix(); renderer.setSize(width, height);
      if (!touched) fit(currentView);
    };
    const observer = new ResizeObserver(resize); observer.observe(el); resize();
    const stop = (): void => { touched = true; controls.autoRotate = false; setRotating(false); setView('custom'); };
    renderer.domElement.addEventListener('pointerdown', stop);
    const keyboard = (event: KeyboardEvent): void => {
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      event.preventDefault(); stop();
      const offset = camera.position.clone().sub(controls.target);
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') offset.applyAxisAngle(new THREE.Vector3(0, 1, 0), event.key === 'ArrowLeft' ? -.12 : .12);
      else offset.multiplyScalar(event.key === 'ArrowUp' ? .9 : 1.1);
      camera.position.copy(controls.target).add(offset); controls.update();
    };
    renderer.domElement.addEventListener('keydown', keyboard);
    const contextLost = (event: Event): void => { event.preventDefault(); setError('The graphics session was interrupted. Close and reopen this view to reload the model.'); };
    renderer.domElement.addEventListener('webglcontextlost', contextLost);
    renderer.setAnimationLoop(() => {
      if (onShip && controls.autoRotate) { const angle = controls.getAzimuthalAngle(); if (angle < -1.1) controls.autoRotateSpeed = -.65; if (angle > 1.1) controls.autoRotateSpeed = .65; }
      controls.update(); renderer.render(scene, camera);
    });
    return () => {
      renderer.setAnimationLoop(null); observer.disconnect(); controls.dispose(); orbit.current = null; dimensionControl.current = null;
      renderer.domElement.removeEventListener('pointerdown', stop); renderer.domElement.removeEventListener('keydown', keyboard); renderer.domElement.removeEventListener('webglcontextlost', contextLost);
      disposeScene(scene); envMap.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
    };
  }, [spec, onShip]);
  useEffect(() => { if (dimensionControl.current) dimensionControl.current.visible = dimensions; }, [dimensions, onShip, spec]);
  const switchScene = (ship: boolean): void => { setOnShip(ship); setRotating(false); setView('perspective'); };
  const rotate = (): void => { const next = !rotating; setRotating(next); if (orbit.current) orbit.current.autoRotate = next; if (next) setView('custom'); };
  return <div className="p3d-backdrop" role="presentation" onClick={(event) => event.target === event.currentTarget && onClose()}>
    <section className="p3d" role="dialog" aria-modal="true" aria-label={`3D view of ${title}`} ref={dialog} onKeyDown={(event) => {
      if (event.key === 'Escape') { event.stopPropagation(); onClose(); }
      if (event.key === 'Tab') { const items = [...(dialog.current?.querySelectorAll<HTMLElement>('button:not(:disabled), [tabindex="0"]') ?? [])]; const first = items[0]; const last = items.at(-1); if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); } else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); } }
    }}>
      <header className="p3d-head"><div><span className="p3d-eyebrow">Product explorer <span>3D</span></span><h2>{title}</h2><p>{spec.horizontal ? 'Width × depth' : 'Width × height'} · {Math.round(spec.width * 1000).toLocaleString('en-GB')} × {Math.round(spec.dimension * 1000).toLocaleString('en-GB')} mm{spec.inferredSize ? ' · illustrative dimensions' : ''}</p></div><button className="p3d-close" onClick={onClose} aria-label="Close 3D view">×</button></header>
      <div className="p3d-stage">
        <div className="p3d-stage-top"><div className="p3d-toggle" role="group" aria-label="Scene"><button aria-pressed={onShip} onClick={() => switchScene(true)}>Cruise deck</button><button aria-pressed={!onShip} onClick={() => switchScene(false)}>Product only</button></div><span className="p3d-interaction-hint">Drag to orbit · Scroll to zoom</span></div>
        <div className="p3d-canvas" ref={mount} />
        {error && <div className="p3d-error" role="alert">{error}</div>}
        <div className="p3d-toolbar"><div className="p3d-views" role="group" aria-label="Camera view">{([['perspective', '3/4 view'], ['front', 'Front'], ['top', 'Top'], ...(onShip ? [['ship', 'Ship overview'], ['detail', 'Installed detail']] as const : [])] as const).map(([value, label]) => <button key={value} aria-pressed={view === value} onClick={() => viewControl.current(value)}>{label}</button>)}</div><span className="p3d-tool-divider" /><button aria-pressed={dimensions} onClick={() => setDimensions(!dimensions)}>Dimensions</button><button aria-pressed={rotating} onClick={rotate}>{rotating ? 'Pause orbit' : 'Auto orbit'}</button><button className="p3d-reset" aria-label="Reset 3D view" title="Reset view" onClick={() => viewControl.current('perspective')}><Icon name="refresh" size={17} /></button></div>
      </div>
      <footer className="p3d-footer"><div className="p3d-materials">{!['deck', 'other', 'handrail'].includes(spec.kind) && <span><i className="p3d-swatch glass" />Glazing</span>}<span><i className="p3d-swatch metal" />Metal frame</span>{spec.horizontal && <span><i className="p3d-swatch teak" />Deck finish</span>}</div><p>Illustrative geometry and finishes.{spec.trapezoid ? ' Taper inferred from the product name.' : spec.curved ? ' Curvature inferred from the product name.' : ''}{spec.incline > 0 ? ` ${spec.incline}° incline${spec.inferredIncline ? ' assumed' : ' from catalog'}.` : ''} Confirm construction details in the technical drawings.</p></footer>
    </section>
  </div>;
}
