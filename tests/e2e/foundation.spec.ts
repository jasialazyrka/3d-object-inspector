import { expect, test, type Page } from '@playwright/test';

/**
 * SPEC-000 — foundation: canvas, render loop, test seam.
 *
 * Behaviour is observed through the seam (AGENTS.md §7), never by pixel comparison. The one
 * exception is AC-000-3, which samples the framebuffer purely as a blank-check against total
 * render failure — it asserts that not all sampled pixels are identical, not what they are.
 *
 * `window.__inspector__` is an injected global, so it is reached through a narrowing cast rather
 * than a global augmentation, which would collide with the one src/testing/seam.ts may declare.
 */
type Quaternion = { x: number; y: number; z: number; w: number };

type SeamWindow = Window & {
  __inspector__?: {
    getRotation(): Quaternion;
    getFrameCount(): number;
  };
};

async function waitForSeam(page: Page): Promise<void> {
  await page.waitForFunction(() => (window as SeamWindow).__inspector__ !== undefined);
}

async function waitForFrames(page: Page, minFrames: number): Promise<void> {
  await page.waitForFunction((min: number) => {
    const seam = (window as SeamWindow).__inspector__;
    return seam !== undefined && seam.getFrameCount() >= min;
  }, minFrames);
}

function readFrameCount(page: Page): Promise<number> {
  return page.evaluate(() => {
    const seam = (window as SeamWindow).__inspector__;
    if (seam === undefined) throw new Error('window.__inspector__ is not installed');
    return seam.getFrameCount();
  });
}

function readRotation(page: Page): Promise<Quaternion> {
  return page.evaluate(() => {
    const seam = (window as SeamWindow).__inspector__;
    if (seam === undefined) throw new Error('window.__inspector__ is not installed');
    return seam.getRotation();
  });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
});

test('[AC-000-1] mounts into #root and renders exactly one <canvas>', async ({ page }) => {
  const root = page.locator('#root');

  await expect(root).toHaveCount(1);
  await expect(root).not.toBeEmpty();
  await expect(root.locator('canvas')).toHaveCount(1);
  await expect(page.locator('canvas')).toHaveCount(1);
});

test('[AC-000-2] the canvas has a usable WebGL context (webgl2 or webgl)', async ({ page }) => {
  await waitForFrames(page, 1);

  const context = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) throw new Error('no <canvas> element was rendered');

    // getContext() returns the canvas's existing context when the type matches, and null when a
    // context of a different type is already attached — so webgl2 is probed before webgl.
    const gl2 = canvas.getContext('webgl2');
    if (gl2 !== null) {
      return {
        type: 'webgl2',
        lost: gl2.isContextLost(),
        version: String(gl2.getParameter(gl2.VERSION)),
      };
    }
    const gl1 = canvas.getContext('webgl');
    if (gl1 !== null) {
      return {
        type: 'webgl',
        lost: gl1.isContextLost(),
        version: String(gl1.getParameter(gl1.VERSION)),
      };
    }
    return { type: null, lost: true, version: '' };
  });

  expect(['webgl2', 'webgl']).toContain(context.type);
  expect(context.lost).toBe(false);
  expect(context.version).toMatch(/WebGL/i);
});

test('[AC-000-3] renders a non-blank image: sampled pixels are not all identical', async ({
  page,
}) => {
  // Sample only once the render loop has actually produced frames; an empty framebuffer read
  // before the first draw would be a blank canvas for the wrong reason.
  await waitForFrames(page, 2);

  const sample = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (canvas === null) throw new Error('no <canvas> element was rendered');

    const gl: WebGLRenderingContext | WebGL2RenderingContext | null =
      canvas.getContext('webgl2') ?? canvas.getContext('webgl');
    if (gl === null) throw new Error('no WebGL context on the canvas');

    const width = gl.drawingBufferWidth;
    const height = gl.drawingBufferHeight;
    const pixels = new Uint8Array(width * height * 4);
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);

    // A coarse grid over the whole framebuffer: dense enough to hit the object wherever it is,
    // cheap enough to serialize as a single count.
    const step = 8;
    const colours = new Set<string>();
    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const offset = (y * width + x) * 4;
        colours.add(Array.from(pixels.subarray(offset, offset + 4)).join(','));
      }
    }

    return { width, height, distinctColours: colours.size };
  });

  expect(sample.width).toBeGreaterThan(0);
  expect(sample.height).toBeGreaterThan(0);
  expect(sample.distinctColours).toBeGreaterThan(1);
});

test('[AC-000-4] window.__inspector__ exposes getRotation() and getFrameCount() in a dev build', async ({
  page,
}) => {
  await waitForSeam(page);

  const seam = await page.evaluate(() => {
    const installed = (window as SeamWindow).__inspector__;
    if (installed === undefined) throw new Error('window.__inspector__ is not installed');
    return {
      getRotationType: typeof installed.getRotation,
      getFrameCountType: typeof installed.getFrameCount,
      rotationKeys: Object.keys(installed.getRotation()).sort(),
      rotationValueTypes: Object.values(installed.getRotation()).map((value) => typeof value),
      frameCountType: typeof installed.getFrameCount(),
    };
  });

  expect(seam.getRotationType).toBe('function');
  expect(seam.getFrameCountType).toBe('function');
  expect(seam.rotationKeys).toEqual(['w', 'x', 'y', 'z']);
  expect(seam.rotationValueTypes).toEqual(['number', 'number', 'number', 'number']);
  expect(seam.frameCountType).toBe('number');
});

test('[AC-000-5] getFrameCount() strictly increases over a 500 ms observation window', async ({
  page,
}) => {
  await waitForSeam(page);

  const first = await readFrameCount(page);

  // Five 100 ms steps: the counter must never go backwards within the window...
  let previous = first;
  for (let step = 0; step < 5; step += 1) {
    await page.waitForTimeout(100);
    const current = await readFrameCount(page);
    expect(current).toBeGreaterThanOrEqual(previous);
    previous = current;
  }

  // ...and must have strictly increased across the full 500 ms.
  expect(previous).toBeGreaterThan(first);
});

test('[AC-000-7] getRotation() initially returns the identity quaternion', async ({ page }) => {
  await waitForSeam(page);

  // No interaction has occurred (SPEC-000 has no interactivity), so the orientation is identity.
  expect(await readRotation(page)).toEqual({ x: 0, y: 0, z: 0, w: 1 });
});
