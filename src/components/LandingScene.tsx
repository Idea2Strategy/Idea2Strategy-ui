import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';

/*
  The landing hero: scattered blocks assemble into a lattice as the page
  scrolls. The metaphor is the product itself — strategies are assembled from
  typed blocks — and deliberately not a rising chart, which on a trading
  product would read as a performance claim.

  Scroll position is the only source of truth for the assembly (the parent
  writes 0..1 into progressRef; native scroll drives it both ways). The camera
  and a slight idle sway are the only time-based motion.

  Housekeeping follows the three.js checklist: pixel ratio clamped to 2, the
  render loop pauses while the stage is off screen, reduced motion renders one
  assembled still frame, and every GPU resource is disposed on unmount.
*/

interface LandingSceneProps {
  progressRef: { current: number };
}

const COUNT = 36;

/* Deterministic scatter: the same seed lays the blocks out identically on
   every visit, so the hero does not reshuffle behind the visitor's back. */
function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const easeInOutCubic = (x: number): number => (x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2);
const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export default function LandingScene({ progressRef }: LandingSceneProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [supported, setSupported] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    /* No WebGL (old machines, test environments): keep the CSS poster that
       already sits underneath and render nothing. */
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch {
      setSupported(false);
      return undefined;
    }

    const reduceMotion = Boolean(canvas.closest('.reduce-motion'))
      || (typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 100);
    const group = new THREE.Group();
    scene.add(group);
    scene.add(new THREE.AmbientLight('#ffffff', 1.1));
    const keyLight = new THREE.DirectionalLight('#ffffff', 1.4);
    keyLight.position.set(2.5, 4, 3);
    scene.add(keyLight);

    const geometry = new THREE.BoxGeometry(0.62, 0.62, 0.62);
    const neutralMaterial = new THREE.MeshStandardMaterial({ roughness: 0.55, metalness: 0.15 });
    const accentMaterial = new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.2 });

    /* Block colours come from the theme tokens, so the scene follows the
       light/dark theme and the palette template like every other surface. */
    const readColors = () => {
      const styles = getComputedStyle(canvas);
      neutralMaterial.color.set(styles.getPropertyValue('--line-strong').trim() || '#3a4548');
      accentMaterial.color.set(styles.getPropertyValue('--accent').trim() || '#5ecfca');
    };
    readColors();

    const random = mulberry32(2026);
    const blocks = Array.from({ length: COUNT }, (_, index) => {
      const mesh = new THREE.Mesh(geometry, index % 6 === 0 ? accentMaterial : neutralMaterial);
      /* Scatter on a loose shell around the lattice. */
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(random() * 2 - 1);
      const radius = 5 + random() * 3.5;
      const scatter = new THREE.Vector3(
        Math.sin(phi) * Math.cos(theta) * radius,
        Math.cos(phi) * radius * 0.7 + 0.5,
        Math.sin(phi) * Math.sin(theta) * radius,
      );
      /* Assemble into a 4×3×3 lattice — a built structure, not a chart. */
      const target = new THREE.Vector3(
        ((index % 4) - 1.5) * 0.78,
        ((Math.floor(index / 4) % 3) - 1) * 0.78 + 0.6,
        (Math.floor(index / 12) - 1) * 0.78,
      );
      const rot = new THREE.Euler(random() * 2.4 - 1.2, random() * 2.4 - 1.2, random() * 2.4 - 1.2);
      group.add(mesh);
      return { mesh, scatter, target, rot, delay: ((index * 7) % 12) / 12 * 0.45 };
    });

    /*
      A mouse wheel moves the page in notches, so raw scroll position arrives
      in steps — feeding it straight to the scene makes the assembly jump with
      every notch. The scroll stays the source of truth for the TARGET, and
      each frame closes a time-based fraction of the remaining gap, so the
      blocks glide between wheel steps instead of teleporting. The exponential
      form keeps the feel identical at any frame rate.
    */
    let smoothedProgress = reduceMotion ? 1 : progressRef.current;
    let lastFrameTime = 0;

    const renderFrame = (time: number) => {
      const target = reduceMotion ? 1 : progressRef.current;
      const dt = lastFrameTime ? Math.min(0.1, (time - lastFrameTime) / 1000) : 1 / 60;
      lastFrameTime = time;
      smoothedProgress += (target - smoothedProgress) * (1 - Math.exp(-dt * 8));
      /* Snap the last hair so the scene truly settles instead of chasing an
         asymptote forever. */
      if (Math.abs(target - smoothedProgress) < 0.0005) smoothedProgress = target;
      const progress = reduceMotion ? 1 : smoothedProgress;
      for (const block of blocks) {
        const local = easeInOutCubic(clamp01((progress * 1.35 - block.delay) / 0.9));
        block.mesh.position.lerpVectors(block.scatter, block.target, local);
        block.mesh.rotation.set(block.rot.x * (1 - local), block.rot.y * (1 - local), block.rot.z * (1 - local));
        block.mesh.scale.setScalar(0.55 + 0.45 * local);
      }
      group.rotation.y = reduceMotion ? 0 : Math.sin(time * 0.00035) * 0.05;
      const angle = -0.55 + progress * 1.15;
      const distance = 11.5 - 4 * progress;
      camera.position.set(Math.sin(angle) * distance, 3.6 - 1.2 * progress, Math.cos(angle) * distance);
      camera.lookAt(0, 0.5, 0);
      renderer.render(scene, camera);
    };

    const host = canvas.parentElement ?? canvas;
    const resize = () => {
      const width = host.clientWidth || 1;
      const height = host.clientHeight || 1;
      renderer.setSize(width, height, false);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      if (reduceMotion) renderFrame(0);
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const tick = (time: number) => {
      renderFrame(time);
      raf = requestAnimationFrame(tick);
    };
    const start = () => { if (!raf && !reduceMotion) raf = requestAnimationFrame(tick); };
    const stop = () => { if (raf) { cancelAnimationFrame(raf); raf = 0; } };

    if (reduceMotion) {
      renderFrame(0);
    } else {
      start();
    }

    /* Do not burn the GPU while the hero is scrolled past. */
    const io = typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver((entries) => {
        entries.forEach((entry) => (entry.isIntersecting ? start() : stop()));
      });
    io?.observe(canvas);

    const shell = canvas.closest('.app-shell');
    const themeObserver = typeof MutationObserver === 'undefined' || !shell
      ? null
      : new MutationObserver(() => {
        readColors();
        if (reduceMotion) renderFrame(0);
      });
    if (shell && themeObserver) themeObserver.observe(shell, { attributes: true, attributeFilter: ['data-theme', 'data-palette'] });

    return () => {
      stop();
      io?.disconnect();
      themeObserver?.disconnect();
      window.removeEventListener('resize', resize);
      geometry.dispose();
      neutralMaterial.dispose();
      accentMaterial.dispose();
      renderer.dispose();
    };
  }, [progressRef]);

  if (!supported) return null;
  return <canvas ref={canvasRef} className="landing-stage-canvas" data-testid="landing-scene-canvas" aria-hidden="true" />;
}
