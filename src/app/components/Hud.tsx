import type { RefObject } from 'react';

/** The three readout values the frame loop writes into, by axis. */
export type ReadoutRefs = {
  yaw: RefObject<HTMLSpanElement | null>;
  pitch: RefObject<HTMLSpanElement | null>;
  roll: RefObject<HTMLSpanElement | null>;
};

type HudProps = {
  onReset: () => void;
  readoutRefs: ReadoutRefs;
};

const AXES = ['yaw', 'pitch', 'roll'] as const;

const LABELS: Record<(typeof AXES)[number], string> = {
  yaw: 'Yaw',
  pitch: 'Pitch',
  roll: 'Roll',
};

/**
 * The overlay: the title, the Reset control (AC-003-6) and the degree readout (AC-003-7). It is
 * painted above the full-viewport canvas by `.hud`'s stacking context, so the button is clickable
 * rather than merely visible.
 *
 * The values start at the identity orientation's zeroes and are rewritten in place by the frame
 * loop, which keeps a per-frame numeric update out of React's render path.
 */
export function Hud({ onReset, readoutRefs }: HudProps) {
  return (
    <div className="hud">
      <h1 className="app-title">3D Object Inspector</h1>
      <div className="hud-controls">
        <button type="button" className="hud-button" onClick={onReset}>
          Reset
        </button>
        <dl className="readout" data-testid="orientation-readout">
          {AXES.map((axis) => (
            <div className="readout-row" key={axis}>
              <dt className="readout-label">{LABELS[axis]}</dt>
              <dd className="readout-value">
                <span data-testid={`readout-${axis}`} ref={readoutRefs[axis]}>
                  0°
                </span>
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
