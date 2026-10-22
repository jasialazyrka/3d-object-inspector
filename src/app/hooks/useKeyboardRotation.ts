import type { KeyboardEvent, KeyboardEventHandler, RefObject } from 'react';

import { isResetKey, keyToRotation } from '../../core/input';
import { applyDelta, reset } from '../../core/rotation';
import type { RotationState } from '../../core/rotation';

/**
 * SPEC-003 — event plumbing for keyboard control. The mapping from a key name to a rotation and
 * the reset itself live in src/core (AGENTS.md §3); this reads `event.key` / `event.shiftKey` and
 * writes the authoritative state the frame loop advances.
 *
 * The handler is returned rather than attached in an effect, and is mounted outside the WebGL
 * canvas for the same reason the pointer handlers are: the canvas element exists several frames
 * before <Canvas> commits its children, so a handler attached from inside the scene would miss
 * the first key presses.
 */

export type KeyboardRotationHandlers = { onKeyDown: KeyboardEventHandler<HTMLElement> };

export function useKeyboardRotation(stateRef: RefObject<RotationState>): KeyboardRotationHandlers {
  const onKeyDown = (event: KeyboardEvent<HTMLElement>): void => {
    // A reset wins outright: it is a jump to identity, not a delta (AC-003-5).
    if (isResetKey(event.key)) {
      stateRef.current = reset(stateRef.current);
      event.preventDefault();
      return;
    }

    const rotation = keyToRotation(event.key, { shift: event.shiftKey });
    // Keys the core does not claim fall through untouched, so the browser still handles them.
    if (rotation === null) return;

    stateRef.current = applyDelta(stateRef.current, rotation);
    // Handled keys are consumed, so the arrows rotate instead of scrolling the page (AC-003-8).
    event.preventDefault();
  };

  return { onKeyDown };
}
