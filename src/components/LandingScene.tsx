import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import {
  ASSEMBLY_END,
  EXPLODE_END,
  MERGE_END,
  MERGE_START,
  REDUCED_MOTION_PROGRESS,
  SHAKE_END,
  clamp01,
  easeInOutCubic,
  easeInQuart,
  easeOutQuart,
  phaseLocal,
} from '../lib/landingTimeline';

/*
  The landing hero in four scroll-scrubbed acts (boundaries in landingTimeline):

    1. Scattered blocks assemble into a lattice — the product's own metaphor,
       deliberately not a rising chart, which on a trading product would read
       as a performance claim.
    2. The lattice accelerates inward and snaps into one solid cube.
    3. The cube trembles harder and harder while turning white.
    4. It bursts, shards flying past the screen edges, and the stage empties.

  Scroll position is the only source of truth (the parent writes 0..1 into
  progressRef; native scroll drives it both ways, so every act rewinds). Time
  only feeds the idle sway and the tremble oscillation — their amplitude is
  still scroll-driven, so scrolling back calms the cube down.

  Housekeeping follows the three.js checklist: pixel ratio clamped to 2, the
  render loop pauses while the stage is off screen, reduced motion renders one
  assembled still frame, and every GPU resource is disposed on unmount.
*/

interface LandingSceneProps {
  progressRef: { current: number };
}

const COUNT = 36;
const CENTER = new THREE.Vector3(0, 0.6, 0);
const WHITE = new THREE.Color('#ffffff');

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

    /* The single cube the blocks merge into. Same geometry and same scale as
       the fully converged blob of blocks, so the handoff is size-continuous:
       the cube stays exactly as small as the merge left it, and the camera —
       not the cube — provides the presence by pushing in. */
    const MERGED_SCALE = 0.7;
    const cubeMaterial = new THREE.MeshStandardMaterial({ roughness: 0.35, metalness: 0.2 });
    const cube = new THREE.Mesh(geometry, cubeMaterial);
    cube.position.copy(CENTER);
    cube.scale.setScalar(MERGED_SCALE);
    cube.visible = false;
    group.add(cube);

    /* Block colours come from the theme tokens, so the scene follows the
       light/dark theme and the palette template like every other surface.
       Bases are kept separately because the acts tint the live colours. */
    const baseNeutral = new THREE.Color('#3a4548');
    const baseAccent = new THREE.Color('#5ecfca');
    const readColors = () => {
      const styles = getComputedStyle(canvas);
      baseNeutral.set(styles.getPropertyValue('--line-strong').trim() || '#3a4548');
      baseAccent.set(styles.getPropertyValue('--accent').trim() || '#5ecfca');
    };
    readColors();

    const random = mulberry32(2026);
    const blocks = Array.from({ length: COUNT }, (_, index) => {
      const material = index % 6 === 0 ? accentMaterial : neutralMaterial;
      const mesh = new THREE.Mesh(geometry, material);
      /* Scatter on a loose shell around the lattice. The radius stays modest:
         travel distance is what turns one wheel notch into a visible dart. */
      const theta = random() * Math.PI * 2;
      const phi = Math.acos(random() * 2 - 1);
      const radius = 4 + random() * 2.5;
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
      /* A continuous random stagger, so blocks join one by one instead of in
         bursts of shared delay buckets. */
      return { mesh, material, scatter, target, rot, delay: random() * 0.4 };
    });

    /*
      The burst is dust, not flying blocks: hundreds of tiny points spraying
      from the cube. Every position is a pure function of the burst phase (a
      per-point direction, reach, and a quadratic downward drift), so the
      cloud rewinds perfectly when the page scrolls back up.
    */
    const DUST_COUNT = 420;
    const dustDirections = new Float32Array(DUST_COUNT * 3);
    const dustReach = new Float32Array(DUST_COUNT);
    const dustFall = new Float32Array(DUST_COUNT);
    for (let i = 0; i < DUST_COUNT; i++) {
      /* Biased toward the view plane so the dust heads for the screen edges
         rather than diving into the camera or the horizon. */
      const burstAngle = random() * Math.PI * 2;
      const planar = 0.75 + random() * 0.45;
      const dx = Math.cos(burstAngle) * planar;
      const dy = Math.sin(burstAngle) * planar;
      const dz = (random() - 0.5) * 0.6;
      const norm = Math.hypot(dx, dy, dz) || 1;
      dustDirections[i * 3] = dx / norm;
      dustDirections[i * 3 + 1] = dy / norm;
      dustDirections[i * 3 + 2] = dz / norm;
      dustReach[i] = 7 + random() * 9;
      dustFall[i] = 0.6 + random() * 1.8;
    }
    const dustPositions = new Float32Array(DUST_COUNT * 3);
    const dustGeometry = new THREE.BufferGeometry();
    dustGeometry.setAttribute('position', new THREE.BufferAttribute(dustPositions, 3));
    const dustMaterial = new THREE.PointsMaterial({
      color: WHITE,
      size: 0.06,
      transparent: true,
      depthWrite: false,
      sizeAttenuation: true,
    });
    const dust = new THREE.Points(dustGeometry, dustMaterial);
    dust.visible = false;
    dust.frustumCulled = false;
    group.add(dust);

    const workPosition = new THREE.Vector3();

    /*
      A mouse wheel moves the page in notches, so raw scroll position arrives
      in steps — feeding it straight to the scene makes everything jump with
      every notch. The scroll stays the source of truth for the TARGET, and
      each frame closes a time-based fraction of the remaining gap, so the
      scene glides between wheel steps instead of teleporting. The exponential
      form keeps the feel identical at any frame rate.
    */
    let smoothedProgress = reduceMotion ? REDUCED_MOTION_PROGRESS : progressRef.current;
    let lastFrameTime = 0;

    const renderFrame = (time: number) => {
      const target = reduceMotion ? REDUCED_MOTION_PROGRESS : progressRef.current;
      const dt = lastFrameTime ? Math.min(0.1, (time - lastFrameTime) / 1000) : 1 / 60;
      lastFrameTime = time;
      /* 4.5/s ≈ 220ms time constant: soft enough that a wheel notch reads as a
         glide, quick enough that the scene never feels detached from the hand. */
      smoothedProgress += (target - smoothedProgress) * (1 - Math.exp(-dt * 4.5));
      /* Snap the last hair so the scene truly settles instead of chasing an
         asymptote forever. */
      if (Math.abs(target - smoothedProgress) < 0.0005) smoothedProgress = target;
      const p = reduceMotion ? REDUCED_MOTION_PROGRESS : smoothedProgress;

      const assembly = clamp01(p / ASSEMBLY_END);
      const merge = easeInQuart(phaseLocal(p, MERGE_START, MERGE_END));
      const shake = phaseLocal(p, MERGE_END, SHAKE_END);
      const burst = phaseLocal(p, SHAKE_END, EXPLODE_END);

      /* Act 2 colour: every block drifts to the one accent colour as it
         converges, so the merge unifies colour and shape together. */
      neutralMaterial.color.copy(baseNeutral).lerp(baseAccent, merge);
      accentMaterial.color.copy(baseAccent);

      for (const block of blocks) {
        if (merge >= 1) {
          /* Fully merged: the cube (then the dust) stands in for all of them. */
          block.mesh.visible = false;
          continue;
        }
        block.mesh.visible = true;
        /* Act 1: each block starts at its own delay and lands by the end of
           the assembly act — a long window per block is most of what makes
           the approach read as smooth. */
        const local = easeInOutCubic(clamp01((assembly - block.delay) / (1 - block.delay)));
        workPosition.copy(block.scatter).lerp(block.target, local);
        /* Act 2: accelerate from the lattice into the centre, shrinking to
           the exact size the cube will take over at. */
        block.mesh.position.copy(workPosition).lerp(CENTER, merge);
        const unrolled = (1 - local) * (1 - merge);
        block.mesh.rotation.set(block.rot.x * unrolled, block.rot.y * unrolled, block.rot.z * unrolled);
        block.mesh.scale.setScalar((0.55 + 0.45 * local) * (1 - (1 - MERGED_SCALE) * merge));
      }

      /* Act 4: dust. Full speed at the first instant — the "펑" — every mote
         drifting slightly downward as it thins out toward the edges. */
      dust.visible = burst > 0;
      if (dust.visible) {
        const fly = easeOutQuart(burst);
        for (let i = 0; i < DUST_COUNT; i++) {
          const reach = dustReach[i] * fly;
          dustPositions[i * 3] = CENTER.x + dustDirections[i * 3] * reach;
          dustPositions[i * 3 + 1] = CENTER.y + dustDirections[i * 3 + 1] * reach - dustFall[i] * fly * fly;
          dustPositions[i * 3 + 2] = CENTER.z + dustDirections[i * 3 + 2] * reach;
        }
        dustGeometry.attributes.position.needsUpdate = true;
        dustMaterial.opacity = 1 - clamp01((burst - 0.5) / 0.5);
        dustMaterial.size = 0.06 * (1 - 0.35 * fly);
      }

      /* Act 3: the cube stays at the merged size — no pop, no overshoot. The
         tremble is a fine, fast vibration: small amplitude, high frequency —
         a charge building up, not a box being shoved around. Amplitude is
         scroll-gated, so scrolling back calms it down. */
      cube.visible = merge >= 1 && burst <= 0;
      if (cube.visible) {
        const amplitude = shake * shake * 0.03;
        const wobble = reduceMotion ? 0 : 1;
        cube.position.set(
          CENTER.x + Math.sin(time * 0.13) * amplitude * wobble,
          CENTER.y + Math.sin(time * 0.11 + 1.7) * amplitude * wobble,
          CENTER.z + Math.sin(time * 0.15 + 0.6) * amplitude * wobble,
        );
        cube.rotation.set(
          Math.sin(time * 0.12 + 0.9) * amplitude * 1.2 * wobble,
          0,
          Math.sin(time * 0.14) * amplitude * 1.2 * wobble,
        );
        cubeMaterial.color.copy(baseAccent).lerp(WHITE, shake);
        cubeMaterial.emissive.copy(WHITE).multiplyScalar(shake * 0.6);
      }

      /* Showcase: once assembled, the lattice turns slowly for the camera
         before the merge pulls it in. The turn holds afterwards (invisible
         once everything sits at the centre) so nothing snaps back. */
      const showcase = easeInOutCubic(phaseLocal(p, ASSEMBLY_END, MERGE_START));
      const sway = reduceMotion ? 0 : Math.sin(time * 0.00035) * 0.05;
      group.rotation.y = sway + showcase * 0.55;

      /* Camera: orbit in during assembly, hold through the showcase, then a
         slow push-in on the small charging cube — the cube keeps its size and
         the camera provides the growing presence — and a pull-back with a
         decaying kick when it blows. */
      let angle: number;
      let distance: number;
      let height: number;
      if (p <= ASSEMBLY_END) {
        angle = -0.55 + assembly * 0.6;
        distance = 11.5 - 3.7 * assembly;
        height = 3.6 - assembly;
      } else if (p <= MERGE_END) {
        const q = phaseLocal(p, ASSEMBLY_END, MERGE_END);
        angle = 0.05 + q * 0.11;
        distance = 7.8 - 0.8 * q;
        height = 2.6 - 0.15 * q;
      } else if (p <= SHAKE_END) {
        const q = easeInOutCubic(phaseLocal(p, MERGE_END, SHAKE_END));
        angle = 0.16 + q * 0.34;
        distance = 7 - 4 * q;
        height = 2.45 - 1.25 * q;
      } else {
        angle = 0.5;
        distance = 3 + 2.5 * easeOutQuart(burst);
        height = 1.2 + 0.6 * burst;
      }
      /* The blast kick: strongest the instant it bursts, decaying with scroll
         so rewinding un-kicks it. */
      const kick = burst > 0 ? ((1 - burst) ** 3) * 0.12 * (reduceMotion ? 0 : 1) : 0;
      camera.position.set(
        Math.sin(angle) * distance + Math.sin(time * 0.09) * kick,
        height + Math.sin(time * 0.073 + 1.3) * kick,
        Math.cos(angle) * distance,
      );
      camera.lookAt(CENTER);
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
      dustGeometry.dispose();
      neutralMaterial.dispose();
      accentMaterial.dispose();
      dustMaterial.dispose();
      cubeMaterial.dispose();
      renderer.dispose();
    };
  }, [progressRef]);

  if (!supported) return null;
  return <canvas ref={canvasRef} className="landing-stage-canvas" data-testid="landing-scene-canvas" aria-hidden="true" />;
}
