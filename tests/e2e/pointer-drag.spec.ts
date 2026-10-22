import { expect, test, type CDPSession, type Page } from '@playwright/test';

/**
 * SPEC-002 — pointer drag with inertia, end to end.
 *
 * Behaviour is observed through the seam (AGENTS.md §7), never by pixel comparison. These tests
 * require `window.__inspector__.getRotation()` to report the LIVE orientation of the object:
 * SPEC-000 left it hardcoded to the identity quaternion (AC-000-7, true only while nothing could
 * rotate), and AC-002-8/AC-002-9 are vacuous until the seam reads the real rotation state.
 *
 * `window.__inspector__` is an injected global, so it is reached through a narrowing cast rather
 * than a global augmentation, which would collide with the one src/testing/seam.ts may declare.
 *
 * Tolerances used here, and why they are wide where they are wide:
 *   - "rotated" / "still moving"  > 1e-3   — a drag of 100+ px is ~0.5 rad, and a velocity just
 *                                           above SPEC-001's settle threshold (1e-5 rad/ms) still
 *                                           turns ~3e-3 rad over 300 ms, so anything genuinely
 *                                           coasting clears this by orders of magnitude;
 *   - "stopped"                  <= 1e-6   — float32 round-tripping through the renderer is the
 *                                           only change allowed once velocity has snapped to zero.
 */
type Quaternion = { x: number; y: number; z: number; w: number };

type SeamWindow = Window & {
  __inspector__?: {
    getRotation(): Quaternion;
    getFrameCount(): number;
  };
};

const IDENTITY: Quaternion = { x: 0, y: 0, z: 0, w: 1 };

const DEGREES_PER_RADIAN = 180 / Math.PI;

/** Largest absolute component difference — the simplest orientation-change metric. */
function maxQuatDiff(a: Quaternion, b: Quaternion): number {
  return Math.max(
    Math.abs(a.x - b.x),
    Math.abs(a.y - b.y),
    Math.abs(a.z - b.z),
    Math.abs(a.w - b.w),
  );
}

/** Yaw about world Y in degrees, normalized to [0, 360) — the same decomposition as SPEC-001. */
function yawDegrees(q: Quaternion): number {
  const m02 = 2 * (q.x * q.z + q.w * q.y);
  const m22 = 1 - 2 * (q.x * q.x + q.y * q.y);
  const degrees = Math.atan2(m02, m22) * DEGREES_PER_RADIAN;
  return ((degrees % 360) + 360) % 360;
}

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

/** The rotation at successive animation frames, starting with the current one. */
function sampleFrames(page: Page, frames: number): Promise<Quaternion[]> {
  return page.evaluate(async (count: number) => {
    const seam = (window as SeamWindow).__inspector__;
    if (seam === undefined) throw new Error('window.__inspector__ is not installed');

    const samples = [seam.getRotation()];
    for (let i = 0; i < count; i += 1) {
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => resolve());
      });
      samples.push(seam.getRotation());
    }
    return samples;
  }, frames);
}

/** How much the rotation changes over `ms` of wall clock, measured inside the page. */
function rotationChangeOver(page: Page, ms: number): Promise<number> {
  return page.evaluate(async (windowMs: number) => {
    const seam = (window as SeamWindow).__inspector__;
    if (seam === undefined) throw new Error('window.__inspector__ is not installed');

    const before = seam.getRotation();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, windowMs);
    });
    const after = seam.getRotation();

    return Math.max(
      Math.abs(after.x - before.x),
      Math.abs(after.y - before.y),
      Math.abs(after.z - before.z),
      Math.abs(after.w - before.w),
    );
  }, ms);
}

/** Polls until the coast has finished, so later assertions read a stable orientation. */
async function waitForRotationToSettle(page: Page): Promise<void> {
  await expect
    .poll(() => rotationChangeOver(page, 100), { timeout: 8000, intervals: [100] })
    .toBeLessThanOrEqual(1e-6);
}

async function canvasCentre(page: Page): Promise<{ x: number; y: number }> {
  const box = await page.locator('canvas').boundingBox();
  if (box === null) throw new Error('the <canvas> has no bounding box');
  return { x: Math.round(box.x + box.width / 2), y: Math.round(box.y + box.height / 2) };
}

/**
 * A drag that ends paused: the pointer holds still for 400 ms before release, which is longer than
 * the release window, so no inertia is imparted (AC-002-6) and the final orientation is stable.
 */
async function dragAndHoldBeforeRelease(
  page: Page,
  from: { x: number; y: number },
  totalDx: number,
): Promise<void> {
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(from.x + (totalDx * i) / 6, from.y);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(400);
  await page.mouse.up();
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('[AC-002-10] the canvas sets touch-action: none so a touch drag cannot scroll the page', async ({
  page,
}) => {
  const canvas = page.locator('canvas');
  await expect(canvas).toHaveCount(1);

  const touchAction = await canvas.evaluate((element) => getComputedStyle(element).touchAction);

  expect(touchAction).toBe('none');
});

test('[AC-002-8] a rightward drag increases yaw: the seam reports a non-identity rotation with positive yaw', async ({
  page,
}) => {
  await waitForSeam(page);
  expect(await readRotation(page)).toEqual(IDENTITY);

  const centre = await canvasCentre(page);
  await dragAndHoldBeforeRelease(page, { x: centre.x - 60, y: centre.y }, 120);
  await waitForRotationToSettle(page);

  const rotation = await readRotation(page);

  // The object actually moved...
  expect(maxQuatDiff(rotation, IDENTITY)).toBeGreaterThan(1e-3);
  // ...by a positive rotation about world Y: q = (0, sin(a/2), 0, cos(a/2)) with a > 0.
  expect(rotation.y).toBeGreaterThan(1e-3);
  expect(yawDegrees(rotation)).toBeGreaterThan(0);
  expect(yawDegrees(rotation)).toBeLessThan(180);
  // A purely horizontal drag is pure yaw: no pitch, no roll.
  expect(Math.abs(rotation.x)).toBeLessThanOrEqual(1e-6);
  expect(Math.abs(rotation.z)).toBeLessThanOrEqual(1e-6);
});

test('[AC-002-8] a leftward drag yaws the opposite way, so the object follows the pointer', async ({
  page,
}) => {
  await waitForSeam(page);

  const centre = await canvasCentre(page);
  await dragAndHoldBeforeRelease(page, { x: centre.x + 60, y: centre.y }, -120);
  await waitForRotationToSettle(page);

  const rotation = await readRotation(page);

  expect(maxQuatDiff(rotation, IDENTITY)).toBeGreaterThan(1e-3);
  expect(rotation.y).toBeLessThan(-1e-3);
  expect(yawDegrees(rotation)).toBeGreaterThan(180);
  expect(yawDegrees(rotation)).toBeLessThan(360);
});

test('[AC-002-8] a downward drag pitches the object, so vertical pixels map to world X', async ({
  page,
}) => {
  await waitForSeam(page);

  const centre = await canvasCentre(page);
  await page.mouse.move(centre.x, centre.y - 60);
  await page.mouse.down();
  for (let i = 1; i <= 6; i += 1) {
    await page.mouse.move(centre.x, centre.y - 60 + i * 20);
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(400);
  await page.mouse.up();
  await waitForRotationToSettle(page);

  const rotation = await readRotation(page);

  expect(maxQuatDiff(rotation, IDENTITY)).toBeGreaterThan(1e-3);
  // Positive pitch about world X: q = (sin(a/2), 0, 0, cos(a/2)) with a > 0.
  expect(rotation.x).toBeGreaterThan(1e-3);
  expect(Math.abs(rotation.y)).toBeLessThanOrEqual(1e-6);
  expect(Math.abs(rotation.z)).toBeLessThanOrEqual(1e-6);
});

test('[AC-002-9] after releasing a fast drag the rotation keeps changing for at least one further frame, then stops', async ({
  page,
}) => {
  await waitForSeam(page);

  const centre = await canvasCentre(page);
  const start = { x: centre.x - 125, y: centre.y };

  // A flick: five 50 px moves roughly one frame apart, released immediately — so the recent
  // movement sample is fresh and endDrag imparts velocity (AC-002-5).
  await page.mouse.move(start.x, start.y);
  await page.mouse.down();
  for (let i = 1; i <= 5; i += 1) {
    await page.mouse.move(start.x + i * 50, start.y);
    await page.waitForTimeout(16);
  }
  await page.mouse.up();

  // The coast: sample ten consecutive animation frames immediately after release.
  const samples = await sampleFrames(page, 10);
  expect(samples.length).toBe(11);

  let framesThatChanged = 0;
  for (let i = 1; i < samples.length; i += 1) {
    const previous = samples[i - 1];
    const current = samples[i];
    if (previous === undefined || current === undefined) throw new Error('missing sample');
    if (maxQuatDiff(previous, current) > 1e-6) framesThatChanged += 1;
  }

  const first = samples[0];
  const last = samples[samples.length - 1];
  if (first === undefined || last === undefined) throw new Error('missing sample');

  expect(framesThatChanged).toBeGreaterThanOrEqual(1);
  expect(maxQuatDiff(first, last)).toBeGreaterThan(1e-3);

  // ...and then it stops: the damped velocity snaps to exactly zero (AC-001-6), so the reported
  // orientation becomes constant and stays constant.
  await waitForRotationToSettle(page);
  expect(await rotationChangeOver(page, 300)).toBeLessThanOrEqual(1e-6);

  const settled = await readRotation(page);
  expect(await readRotation(page)).toEqual(settled);
});

test.describe('touch input', () => {
  test.use({ hasTouch: true });

  async function dispatchTouch(
    cdp: CDPSession,
    type: 'touchStart' | 'touchMove' | 'touchEnd',
    point: { x: number; y: number } | null,
  ): Promise<void> {
    await cdp.send('Input.dispatchTouchEvent', {
      type,
      touchPoints: point === null ? [] : [{ x: point.x, y: point.y }],
    });
  }

  test('[AC-002-10][AC-002-8] a touch drag rotates the object instead of scrolling the page', async ({
    page,
  }) => {
    await waitForSeam(page);
    expect(await readRotation(page)).toEqual(IDENTITY);

    const centre = await canvasCentre(page);
    const start = { x: centre.x - 60, y: centre.y };

    const cdp = await page.context().newCDPSession(page);
    await dispatchTouch(cdp, 'touchStart', start);
    for (let i = 1; i <= 6; i += 1) {
      await dispatchTouch(cdp, 'touchMove', { x: start.x + i * 20, y: start.y });
      await page.waitForTimeout(16);
    }
    await page.waitForTimeout(400);
    await dispatchTouch(cdp, 'touchEnd', null);

    await waitForRotationToSettle(page);

    const rotation = await readRotation(page);
    expect(maxQuatDiff(rotation, IDENTITY)).toBeGreaterThan(1e-3);
    expect(rotation.y).toBeGreaterThan(1e-3);

    // The page did not scroll: the touch gesture was consumed by the canvas.
    const scroll = await page.evaluate(() => ({
      x: window.scrollX,
      y: window.scrollY,
    }));
    expect(scroll).toEqual({ x: 0, y: 0 });
  });
});
