import { useRef } from 'react';
import type { PointerEvent, PointerEventHandler, RefObject } from 'react';

import { DEFAULT_RELEASE_WINDOW_MS, beginDrag, dragMove, endDrag } from '../../core/input';
import type { RecentMovement } from '../../core/input';
import type { RotationState } from '../../core/rotation';

/**
 * SPEC-002 — event plumbing for the drag gesture. Pointer events only, so mouse and touch share
 * one path; all of the maths lives in src/core/input.ts (AGENTS.md §3).
 *
 * The handlers are returned rather than attached in an effect, and are mounted outside the WebGL
 * canvas: the canvas and its render loop appear a few frames after the first commit, and a
 * pointerdown that lands in that window would otherwise be dropped and the whole gesture lost.
 */

/** A pointer position in CSS pixels, stamped with the event time in milliseconds. */
type Sample = { x: number; y: number; tMs: number };

/** The sampling window: the longest interval the core still reads as a fresh release. */
const SAMPLE_WINDOW_MS = DEFAULT_RELEASE_WINDOW_MS;

export type PointerDragHandlers = {
  onPointerDown: PointerEventHandler<HTMLElement>;
  onPointerMove: PointerEventHandler<HTMLElement>;
  onPointerUp: PointerEventHandler<HTMLElement>;
  onPointerCancel: PointerEventHandler<HTMLElement>;
};

/**
 * The pointer's net movement over the sampling window, an interval of fixed length ending at the
 * release instant.
 *
 * A pointer emits no event while it is still, so its position is the last sample's from then until
 * release, and its position when the window opened is that of the newest sample taken at or before
 * then. Both ends of the interval are therefore known exactly, which is what makes a fixed
 * duration honest — and a duration that is neither zero nor stale is immune to the long gaps
 * between pointer events that a busy main thread produces.
 *
 * A drag that paused for longer than the window needs no special case: its last sample opened the
 * window as well as closing it, so the displacement is zero and the release imparts no inertia
 * (AC-002-6).
 */
function recentMovement(samples: readonly Sample[], releaseMs: number): RecentMovement {
  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) return { dx: 0, dy: 0, dtMs: 0 };

  const opened = samples.filter((sample) => sample.tMs <= releaseMs - SAMPLE_WINDOW_MS);
  const start = opened[opened.length - 1] ?? first;

  return { dx: last.x - start.x, dy: last.y - start.y, dtMs: SAMPLE_WINDOW_MS };
}

/** Drops samples older than the window, keeping the one that marks where the window opens. */
function trim(samples: Sample[], nowMs: number): void {
  while (samples.length > 1) {
    const second = samples[1];
    if (second === undefined || second.tMs > nowMs - SAMPLE_WINDOW_MS) break;
    samples.shift();
  }
}

/**
 * Drives `beginDrag` / `dragMove` / `endDrag` from pointer events, writing the authoritative
 * rotation state into `stateRef` — which the render loop reads and advances every frame.
 */
export function usePointerDrag(stateRef: RefObject<RotationState>): PointerDragHandlers {
  const samplesRef = useRef<Sample[]>([]);
  const activePointerRef = useRef<number | null>(null);

  const onPointerDown = (event: PointerEvent<HTMLElement>): void => {
    activePointerRef.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    samplesRef.current = [{ x: event.clientX, y: event.clientY, tMs: event.timeStamp }];
    stateRef.current = beginDrag(stateRef.current);
  };

  const onPointerMove = (event: PointerEvent<HTMLElement>): void => {
    if (event.pointerId !== activePointerRef.current) return;

    const samples = samplesRef.current;
    const previous = samples[samples.length - 1];
    if (previous === undefined) return;

    const sample: Sample = { x: event.clientX, y: event.clientY, tMs: event.timeStamp };
    stateRef.current = dragMove(stateRef.current, {
      dx: sample.x - previous.x,
      dy: sample.y - previous.y,
    });

    samples.push(sample);
    trim(samples, sample.tMs);
  };

  const onPointerUp = (event: PointerEvent<HTMLElement>): void => {
    if (event.pointerId !== activePointerRef.current) return;

    activePointerRef.current = null;
    const target = event.currentTarget;
    if (target.hasPointerCapture(event.pointerId)) target.releasePointerCapture(event.pointerId);

    stateRef.current = endDrag(
      stateRef.current,
      recentMovement(samplesRef.current, event.timeStamp),
    );
    samplesRef.current = [];
  };

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel: onPointerUp };
}
