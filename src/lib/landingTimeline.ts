/*
  The landing hero's shared timeline. The 3D scene (blocks, cube, explosion)
  and the DOM overlays (hero copy, captions, feature notes) choreograph the
  same scroll, so the phase boundaries live in one place both sides import —
  the alternative is two files silently drifting apart.

  All values are normalized hero progress (0 at the first scrolled pixel,
  1 where the sticky stage releases).

    0 ──────────── ASSEMBLY_END: scattered blocks assemble into the lattice
                   (the original act — its px-per-progress pacing is preserved
                   by the hero height in CSS)
    → MERGE_START ─ showcase: the finished lattice turns slowly for the camera
    COPY_EXIT ───── hero copy and captions slide out to the edges
    MERGE_START ─── blocks accelerate into the centre…
    MERGE_END ───── …and snap into one small solid cube (the sudden "확")
    → SHAKE_END ─── the camera pushes in while the cube trembles harder and
                   harder and turns white — the cube itself stays small
    → EXPLODE_END ─ it bursts, shards flying past the screen edges
    NOTES_START/END five feature notes surface one by one near the bottom
*/

export const ASSEMBLY_END = 0.34;
export const COPY_EXIT = 0.42;
export const MERGE_START = 0.46;
export const MERGE_END = 0.54;
export const SHAKE_END = 0.78;
export const EXPLODE_END = 0.94;

export const NOTES_START = 0.54;
export const NOTES_END = 0.97;
export const NOTE_COUNT = 5;

/* Reduced motion shows the assembled lattice — the one still frame that says
   "blocks build a strategy" — not the empty post-explosion stage at p=1. */
export const REDUCED_MOTION_PROGRESS = ASSEMBLY_END;

export const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

export const phaseLocal = (p: number, start: number, end: number): number =>
  clamp01((p - start) / (end - start));

export const easeInOutCubic = (x: number): number =>
  (x < 0.5 ? 4 * x * x * x : 1 - ((-2 * x + 2) ** 3) / 2);

/* Accelerates the whole way and lands at full speed: the merge reads as a
   sudden collapse instead of a glide. */
export const easeInQuart = (x: number): number => x * x * x * x;

/* Full speed at the first instant, then decaying: the burst of the explosion. */
export const easeOutQuart = (x: number): number => 1 - ((1 - x) ** 4);

/* Which feature note floats at centre stage, or -1 outside the note act. */
export function noteIndexAt(progress: number): number {
  if (progress < NOTES_START || progress >= NOTES_END) return -1;
  const span = (NOTES_END - NOTES_START) / NOTE_COUNT;
  return Math.min(NOTE_COUNT - 1, Math.floor((progress - NOTES_START) / span));
}
