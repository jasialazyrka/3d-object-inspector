import { expect, test, type Locator, type Page } from '@playwright/test';

/**
 * SPEC-003 — keyboard control, reset and degree readout, end to end.
 *
 * Behaviour is observed through the seam (AGENTS.md §7) and through the accessibility tree, never
 * by pixel comparison. `window.__inspector__` already reports the live orientation after SPEC-002,
 * so these tests need no new seam surface.
 *
 * `window.__inspector__` is an injected global, so it is reached through a narrowing cast rather
 * than a global augmentation, which would collide with the one src/testing/seam.ts may declare.
 *
 * DOM contract these tests commit the shell to — the criteria name behaviour, not markup, so the
 * selectors are pinned here and nowhere else:
 *
 *   canvas                              tabindex="0" and an accessible name (aria-label) that
 *                                       says it is an interactive 3D object (AC-003-1)
 *   role=button, name /reset/i          the Reset control (AC-003-6)
 *   [data-testid="orientation-readout"] the readout container; its text carries the labels
 *                                       Yaw, Pitch and Roll (AC-003-7)
 *   [data-testid="readout-yaw"]         one whole degree value each, as `<n>°` with n an integer
 *   [data-testid="readout-pitch"]       in [0, 360) — the format asserted by READOUT_VALUE below
 *   [data-testid="readout-roll"]
 *
 * Key steps, from src/core/input.ts (SPEC-003): one unshifted arrow press is 0.05 rad
 * (2.8647889756541165 degrees, which reads as 3), one shifted press is 0.2 rad
 * (11.459155902616466 degrees, which reads as 11).
 *
 * Tolerances: the quaternion after a keyboard step is asserted to 1e-6, which is float32 noise —
 * wide enough for an orientation that round-trips through the renderer, far tighter than the
 * 0.025 the step itself produces. "Returned to identity" is asserted exactly, because `reset`
 * returns the identity quaternion itself and a zero velocity cannot move it.
 */
type Quaternion = { x: number; y: number; z: number; w: number };

type SeamWindow = Window & {
  __inspector__?: {
    getRotation(): Quaternion;
    getFrameCount(): number;
  };
};

type KeyLogEntry = { key: string; shift: boolean; prevented: boolean };

type KeyLogWindow = Window & { __keyLog__?: KeyLogEntry[] };

const IDENTITY: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

/** One unshifted arrow press, in radians (src/core/input.ts DEFAULT_KEY_STEP). */
const KEY_STEP = 0.05;

/** A whole degree value with a degree sign: "0°", "11°", "359°" — never "360°", never a decimal. */
const READOUT_VALUE = /^\s*(\d{1,3})\s*°\s*$/;

async function waitForSeam(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as SeamWindow).__inspector__ !== undefined);
}

function readRotation(page: Page): Promise<Quaternion> {
  return page.evaluate(() => {
    const seam = (window as SeamWindow).__inspector__;
    if (seam === undefined) throw new Error('window.__inspector__ is not installed');
    return seam.getRotation();
  });
}

/** Largest absolute component difference — the simplest orientation-change metric. */
function maxQuatDiff(a: Quaternion, b: Quaternion): number {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.z - b.z),
    Math.abs(a.w - b.w),
  );
}

function canvas(page: Page): Locator {
  return page.locator('canvas');
}

function resetControl(page: Page): Locator {
  return page.getByRole('button', { name: /reset/i });
}

/** Parses the three whole-degree values out of the readout, asserting the format of each. */
async function readReadout(page: Page): Promise<{ yaw: number; pitch: number; roll: number }> {
  const values = await Promise.all(
    (['yaw', 'pitch', 'roll'] as const).map(async (axis) => {
      const text = await page.locator(`[data-testid="readout-${axis}"]`).innerText();
      const match = READOUT_VALUE.exec(text);
      if (match === null) {
        throw new Error(`readout-${axis} is "${text}", which is not a whole degree value`);
      }
      const digits = match[1];
      if (digits === undefined) throw new Error(`readout-${axis} matched without a number`);
      return Number.parseInt(digits, 10);
    }),
  );

  const [yaw, pitch, roll] = values;
  if (yaw === undefined || pitch === undefined || roll === undefined) {
    throw new Error('the readout is missing one of yaw, pitch and roll');
  }
  return { yaw, pitch, roll };
}

/** True when the element (or a descendant) is what a click at its centre would actually hit. */
function isHitTestable(locator: Locator): Promise<boolean> {
  return locator.evaluate((element) => {
    const box = element.getBoundingClientRect();
    if (box.width === 0 || box.height === 0) return false;
    const top = document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
    return top !== null && (top === element || element.contains(top));
  });
}

/** Focuses the canvas and asserts it really took focus, so the key presses below land on it. */
async function focusCanvas(page: Page): Promise<void> {
  await canvas(page).focus();
  await expect(canvas(page)).toBeFocused();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('[AC-003-1] the canvas is keyboard focusable with tabIndex 0 and is named as an interactive 3D object', async ({
  page,
}) => {
  await expect(canvas(page)).toHaveCount(1);

  // tabIndex 0 specifically: -1 would be programmatically focusable but unreachable by Tab.
  await expect(canvas(page)).toHaveAttribute('tabindex', '0');
  expect(await canvas(page).evaluate((element) => element.tabIndex)).toBe(0);

  // An accessible name that says what the thing is and that it can be operated.
  await expect(canvas(page)).toHaveAccessibleName(/3d/i);
  await expect(canvas(page)).toHaveAccessibleName(/interactiv|rotat|drag|arrow/i);

  const name = await canvas(page).evaluate(
    (element) => element.getAttribute('aria-label') ?? element.getAttribute('aria-labelledby'),
  );
  expect(name).not.toBeNull();

  // Reachable by keyboard alone: tabbing from the start of the document arrives at the canvas.
  await page.evaluate(() => {
    document.body.focus();
  });
  let reached = false;
  for (let i = 0; i < 8 && !reached; i += 1) {
    await page.keyboard.press('Tab');
    reached = await canvas(page).evaluate((element) => document.activeElement === element);
  }
  expect(reached).toBe(true);
});

test('[AC-003-9] focusing the canvas and pressing ArrowRight changes the rotation reported by the seam; pressing r returns it to the identity quaternion', async ({
  page,
}) => {
  await waitForSeam(page);
  expect(await readRotation(page)).toEqual(IDENTITY);

  await focusCanvas(page);
  await page.keyboard.press('ArrowRight');

  await expect
    .poll(async () => maxQuatDiff(await readRotation(page), IDENTITY), { timeout: 5000 })
    .toBeGreaterThan(1e-3);

  await page.keyboard.press('r');

  await expect
    .poll(async () => maxQuatDiff(await readRotation(page), IDENTITY), { timeout: 5000 })
    .toBeLessThanOrEqual(1e-6);
  expect(await readRotation(page)).toEqual(IDENTITY);

  // ...and it stays there: a reset zeroes the velocity, so nothing coasts afterwards.
  await page.waitForTimeout(300);
  expect(await readRotation(page)).toEqual(IDENTITY);
});

test('[AC-003-9][AC-003-2] ArrowRight turns the object by exactly one positive yaw step of 0.05 rad', async ({
  page,
}) => {
  await waitForSeam(page);
  await focusCanvas(page);

  await page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => maxQuatDiff(await readRotation(page), IDENTITY), { timeout: 5000 })
    .toBeGreaterThan(1e-3);

  const expected: Quaternion = {
    x: 0,
    y: Math.sin(KEY_STEP / 2),
    z: 0,
    w: Math.cos(KEY_STEP / 2),
  };
  const rotation = await readRotation(page);

  expect(maxQuatDiff(rotation, expected)).toBeLessThanOrEqual(1e-6);
  // Positive yaw about world Y, and nothing else: the keyboard agrees with a rightward drag.
  expect(rotation.y).toBeGreaterThan(0);
  expect(Math.abs(rotation.x)).toBeLessThanOrEqual(1e-6);
  expect(Math.abs(rotation.z)).toBeLessThanOrEqual(1e-6);
});

test('[AC-003-8] handled keys are defaultPrevented and unhandled keys are not, so arrows rotate instead of scrolling', async ({
  page,
}) => {
  await waitForSeam(page);
  await focusCanvas(page);

  // A window-level listener runs after the element's own handler, so it observes the outcome.
  await page.evaluate(() => {
    const log: KeyLogEntry[] = [];
    (window as KeyLogWindow).__keyLog__ = log;
    window.addEventListener('keydown', (event: KeyboardEvent) => {
      log.push({ key: event.key, shift: event.shiftKey, prevented: event.defaultPrevented });
    });
  });

  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('r');
  await page.keyboard.press('q');
  await page.keyboard.press('PageDown');

  const log = await page.evaluate(() => (window as KeyLogWindow).__keyLog__ ?? []);
  const prevented = (key: string): boolean[] =>
    log.filter((entry) => entry.key === key).map((entry) => entry.prevented);

  for (const key of ['ArrowRight', 'ArrowLeft', 'ArrowUp', 'ArrowDown', 'r']) {
    expect(prevented(key).length).toBeGreaterThanOrEqual(1);
    expect(prevented(key).every((value) => value)).toBe(true);
  }

  // The shifted arrow is handled too — Shift changes the step, not whether the key is ours.
  const shifted = log.filter((entry) => entry.key === 'ArrowRight' && entry.shift);
  expect(shifted.length).toBe(1);
  expect(shifted.every((entry) => entry.prevented)).toBe(true);

  // ...and keys the app does not handle are left entirely alone.
  for (const key of ['q', 'PageDown']) {
    expect(prevented(key)).toEqual([false]);
  }
});

test('[AC-003-6] a visible Reset control sits above the canvas and returns the orientation to identity when clicked', async ({
  page,
}) => {
  await waitForSeam(page);

  const reset = resetControl(page);
  await expect(reset).toHaveCount(1);
  await expect(reset).toBeVisible();
  await expect(reset).toBeEnabled();

  // Visible is not the same as reachable: toBeVisible() ignores stacking, so hit-test the centre.
  expect(await isHitTestable(reset)).toBe(true);

  await focusCanvas(page);
  await page.keyboard.press('Shift+ArrowRight');
  await page.keyboard.press('Shift+ArrowDown');
  await expect
    .poll(async () => maxQuatDiff(await readRotation(page), IDENTITY), { timeout: 5000 })
    .toBeGreaterThan(1e-3);

  // A real click, not dispatchEvent: Playwright's actionability check fails if anything — the
  // canvas included — is painted over the control.
  await reset.click();

  await expect
    .poll(async () => maxQuatDiff(await readRotation(page), IDENTITY), { timeout: 5000 })
    .toBeLessThanOrEqual(1e-6);
  expect(await readRotation(page)).toEqual(IDENTITY);
  expect(await readReadout(page)).toEqual({ yaw: 0, pitch: 0, roll: 0 });
});

test('[AC-003-7] the readout shows yaw, pitch and roll as whole degrees and updates as the orientation changes', async ({
  page,
}) => {
  await waitForSeam(page);

  const readout = page.locator('[data-testid="orientation-readout"]');
  await expect(readout).toHaveCount(1);
  await expect(readout).toBeVisible();
  expect(await isHitTestable(readout)).toBe(true);
  await expect(readout).toHaveText(/yaw/i);
  await expect(readout).toHaveText(/pitch/i);
  await expect(readout).toHaveText(/roll/i);

  // At rest the object is at identity, so every angle reads zero.
  expect(await readReadout(page)).toEqual({ yaw: 0, pitch: 0, roll: 0 });

  await focusCanvas(page);

  // One shifted press is 0.2 rad = 11.459155902616466 degrees, which rounds to 11.
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await readReadout(page)).yaw, { timeout: 5000 }).toBe(11);
  expect(await readReadout(page)).toEqual({ yaw: 11, pitch: 0, roll: 0 });

  // A second press adds another 11.459... degrees: 22.918311805232918 rounds to 23.
  await page.keyboard.press('Shift+ArrowRight');
  await expect.poll(async () => (await readReadout(page)).yaw, { timeout: 5000 }).toBe(23);

  // Back to a known orientation, so the pitch below is measured from identity: composing yaw and
  // pitch produces roll, and this test is about the readout, not about Euler composition.
  await page.keyboard.press('r');
  await expect.poll(async () => (await readReadout(page)).yaw, { timeout: 5000 }).toBe(0);
  expect(await readReadout(page)).toEqual({ yaw: 0, pitch: 0, roll: 0 });

  // Three unshifted presses are 0.15 rad = 8.59436692696238 degrees of pitch, which rounds to 9.
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await expect.poll(async () => (await readReadout(page)).pitch, { timeout: 5000 }).toBe(9);
  expect(await readReadout(page)).toEqual({ yaw: 0, pitch: 9, roll: 0 });
});

test('[AC-003-7] every readout value stays a whole number in [0, 360): 359 degrees of yaw never reads 360', async ({
  page,
}) => {
  await waitForSeam(page);
  await focusCanvas(page);

  // 31 shifted presses are 6.2 rad = 355.2338329811104 degrees: just short of a full turn, so the
  // readout must show 355 and not 715 or -5. A 32nd press passes 360 and wraps back near zero.
  for (let i = 0; i < 31; i += 1) {
    await page.keyboard.press('Shift+ArrowRight');
  }
  await expect.poll(async () => (await readReadout(page)).yaw, { timeout: 10_000 }).toBe(355);

  await page.keyboard.press('Shift+ArrowRight');
  // 6.4 rad is 366.6929888837269 degrees, i.e. 6.6929888837269 once wrapped, which reads 7.
  await expect.poll(async () => (await readReadout(page)).yaw, { timeout: 5000 }).toBe(7);

  const values = await readReadout(page);
  for (const angle of [values.yaw, values.pitch, values.roll]) {
    expect(Number.isInteger(angle)).toBe(true);
    expect(angle).toBeGreaterThanOrEqual(0);
    expect(angle).toBeLessThan(360);
  }
});
