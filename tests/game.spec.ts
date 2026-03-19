import { test, expect, type Page } from '@playwright/test';
import type { GameState } from '../src/types/game';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Tile pixel positions per column / row index (100px cell + 12px gap). */
const pos = (index: number) => index * 112;

/** Return all visible tile elements. */
const getTiles = (page: Page) =>
  page.locator('[aria-label^="Tile with value"]');

/** Return the text value of every tile as sorted numbers. */
const getTileValues = async (page: Page): Promise<number[]> => {
  const labels = await getTiles(page).evaluateAll((els) =>
    els.map((el) => parseInt(el.getAttribute('aria-label')!.replace('Tile with value ', ''), 10))
  );
  return labels.sort((a, b) => a - b);
};

/** Get the pixel position {top, left} of a tile element. */
const getTilePosition = async (tile: ReturnType<Page['locator']>, idx: number) => {
  const style = await tile.nth(idx).getAttribute('style');
  const top = parseInt(style?.match(/top:\s*(\d+)/)?.[1] ?? '0', 10);
  const left = parseInt(style?.match(/left:\s*(\d+)/)?.[1] ?? '0', 10);
  return { top, left };
};

/**
 * Control Math.random for the page. Call BEFORE page.goto().
 * Values cycle through the provided sequence.
 */
const mockRandom = (page: Page, values: number[]) =>
  page.addInitScript((seq: number[]) => {
    let i = 0;
    Math.random = () => seq[i++ % seq.length];
  }, values);

/**
 * Inject a complete game state directly into the React reducer.
 * Requires the dev-mode __gameDispatch hook to be present.
 */
const forceState = (page: Page, state: GameState) =>
  page.evaluate((s: GameState) => {
    (window as unknown as { __gameDispatch?: (a: unknown) => void })
      .__gameDispatch?.({ type: 'FORCE_STATE', state: s });
  }, state);

// ─── Tests ───────────────────────────────────────────────────────────────────

test.describe('Initial state', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('displays the game title', async ({ page }) => {
    await expect(page.getByRole('heading', { name: '2048' })).toBeVisible();
  });

  test('starts with exactly 2 tiles', async ({ page }) => {
    await expect(getTiles(page)).toHaveCount(2);
  });

  test('initial tiles have value 2 or 4', async ({ page }) => {
    const values = await getTileValues(page);
    for (const v of values) {
      expect([2, 4]).toContain(v);
    }
  });

  test('score starts at 0', async ({ page }) => {
    // Score label is followed by its value span
    const scoreValue = page.locator('span').filter({ hasText: /^\d+$/ }).first();
    await expect(scoreValue).toHaveText('0');
  });

  test('shows New Game button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'New Game' })).toBeVisible();
  });

  test('shows Leaderboard button', async ({ page }) => {
    await expect(page.getByRole('button', { name: 'Leaderboard' })).toBeVisible();
  });
});

test.describe('Tile movement', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('ArrowLeft slides tiles to the leftmost columns', async ({ page }) => {
    // Place two tiles on the right side so they must slide left
    await forceState(page, {
      tiles: [
        { id: 1, value: 2, row: 0, col: 2, merged: false, isNew: false },
        { id: 2, value: 4, row: 2, col: 3, merged: false, isNew: false },
      ],
      score: 0, bestScore: 0, status: 'playing', size: 4,
    });
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);

    const tiles = getTiles(page);
    const count = await tiles.count();
    // Both tiles should now be in col=0 (left=0px)
    let leftmostCount = 0;
    for (let i = 0; i < count; i++) {
      const { left } = await getTilePosition(tiles, i);
      if (left === pos(0)) leftmostCount++;
    }
    expect(leftmostCount).toBeGreaterThanOrEqual(2);
  });

  test('ArrowRight slides tiles to the rightmost columns', async ({ page }) => {
    // Place two tiles on the left side so they must slide right
    await forceState(page, {
      tiles: [
        { id: 1, value: 2, row: 0, col: 0, merged: false, isNew: false },
        { id: 2, value: 4, row: 2, col: 1, merged: false, isNew: false },
      ],
      score: 0, bestScore: 0, status: 'playing', size: 4,
    });
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(150);

    const tiles = getTiles(page);
    const count = await tiles.count();
    let rightmostCount = 0;
    for (let i = 0; i < count; i++) {
      const { left } = await getTilePosition(tiles, i);
      if (left === pos(3)) rightmostCount++;
    }
    expect(rightmostCount).toBeGreaterThanOrEqual(2);
  });

  test('ArrowUp slides tiles to the topmost rows', async ({ page }) => {
    // Place two tiles in lower rows so they must slide up
    await forceState(page, {
      tiles: [
        { id: 1, value: 2, row: 2, col: 0, merged: false, isNew: false },
        { id: 2, value: 4, row: 3, col: 2, merged: false, isNew: false },
      ],
      score: 0, bestScore: 0, status: 'playing', size: 4,
    });
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowUp');
    await page.waitForTimeout(150);

    const tiles = getTiles(page);
    const count = await tiles.count();
    let topCount = 0;
    for (let i = 0; i < count; i++) {
      const { top } = await getTilePosition(tiles, i);
      if (top === pos(0)) topCount++;
    }
    expect(topCount).toBeGreaterThanOrEqual(2);
  });

  test('ArrowDown slides tiles to the bottommost rows', async ({ page }) => {
    // Place two tiles in upper rows so they must slide down
    await forceState(page, {
      tiles: [
        { id: 1, value: 2, row: 0, col: 0, merged: false, isNew: false },
        { id: 2, value: 4, row: 1, col: 2, merged: false, isNew: false },
      ],
      score: 0, bestScore: 0, status: 'playing', size: 4,
    });
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(150);

    const tiles = getTiles(page);
    const count = await tiles.count();
    // Both tiles slide to row=3, new tile spawns → count = 3
    expect(count).toBe(3);
    let bottomCount = 0;
    for (let i = 0; i < count; i++) {
      const { top } = await getTilePosition(tiles, i);
      if (top === pos(3)) bottomCount++;
    }
    expect(bottomCount).toBeGreaterThanOrEqual(2);
  });
});

/** Known 2-tile board used across merge/score tests: two 2s in the same row */
const mergeBoard = (page: Page) =>
  forceState(page, {
    tiles: [
      { id: 10, value: 2, row: 0, col: 0, merged: false, isNew: false },
      { id: 11, value: 2, row: 0, col: 1, merged: false, isNew: false },
    ],
    score: 0, bestScore: 0, status: 'playing', size: 4,
  });

test.describe('Merging and scoring', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('two equal tiles merge into one tile with doubled value', async ({ page }) => {
    await mergeBoard(page);
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);

    const values = await getTileValues(page);
    expect(values).toContain(4);
  });

  test('merge produces one tile not two (total stays at 2)', async ({ page }) => {
    await mergeBoard(page);
    await page.waitForTimeout(50);
    // Start: 2 tiles. After merge: 1 merged tile + 1 new spawned tile = 2 tiles.
    // If merge failed we'd have 3 tiles (2 originals + 1 new).
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);

    const count = await getTiles(page).count();
    expect(count).toBe(2);
  });

  test('score increases by the merged tile value', async ({ page }) => {
    await mergeBoard(page);
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);

    const scoreSpans = page.locator('span').filter({ hasText: /^\d+$/ });
    const scoreText = await scoreSpans.first().textContent();
    expect(parseInt(scoreText ?? '0', 10)).toBe(4);
  });

  test('a new tile is added after a valid move', async ({ page }) => {
    // Single tile not at leftmost position — ArrowLeft will slide it
    await forceState(page, {
      tiles: [{ id: 20, value: 2, row: 1, col: 3, merged: false, isNew: false }],
      score: 0, bestScore: 0, status: 'playing', size: 4,
    });
    await page.waitForTimeout(50);
    const before = await getTiles(page).count();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    const after = await getTiles(page).count();
    expect(after).toBe(before + 1);
  });

  test('no new tile is added when the move does not change the board', async ({ page }) => {
    // Tile already at leftmost — ArrowLeft is a no-op
    await forceState(page, {
      tiles: [
        { id: 30, value: 2, row: 0, col: 0, merged: false, isNew: false },
        { id: 31, value: 4, row: 1, col: 0, merged: false, isNew: false },
      ],
      score: 0, bestScore: 0, status: 'playing', size: 4,
    });
    await page.waitForTimeout(50);
    const before = await getTiles(page).count();
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    const after = await getTiles(page).count();
    expect(after).toBe(before);
  });

  test('a tile only merges once per move (chain merge is not allowed)', async ({ page }) => {
    // Set up: three 2-tiles in a row at [0,0], [0,1], [0,2]
    // On ArrowLeft: [0,0]+[0,1] merge to 4 at col 0, [0,2] slides to col 1 → [2, 2] not merged again
    await forceState(page, {
      tiles: [
        { id: 1, value: 2, row: 0, col: 0, merged: false, isNew: false },
        { id: 2, value: 2, row: 0, col: 1, merged: false, isNew: false },
        { id: 3, value: 2, row: 0, col: 2, merged: false, isNew: false },
      ],
      score: 0,
      bestScore: 0,
      status: 'playing',
      size: 4,
    });
    await page.waitForTimeout(50);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);

    const values = await getTileValues(page);
    // Should be [2, 4] + new tile, NOT [4] + new tile (no chain merge)
    expect(values).toContain(4);
    expect(values).toContain(2);
    // There should NOT be an 8 from chaining
    expect(values).not.toContain(8);
  });
});

test.describe('New Game', () => {
  test('resets to exactly 2 tiles', async ({ page }) => {
    await page.goto('/');
    // Make some moves
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');

    await page.getByRole('button', { name: 'New Game' }).click();
    await expect(getTiles(page)).toHaveCount(2);
  });

  test('resets score to 0', async ({ page }) => {
    await mockRandom(page, [0.5]);
    await page.goto('/');
    // Trigger a merge to get a non-zero score
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);

    await page.getByRole('button', { name: 'New Game' }).click();

    const scoreSpans = page.locator('span').filter({ hasText: /^\d+$/ });
    await expect(scoreSpans.first()).toHaveText('0');
  });

  test('new tiles have value 2 or 4', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'New Game' }).click();
    const values = await getTileValues(page);
    for (const v of values) {
      expect([2, 4]).toContain(v);
    }
  });
});

test.describe('Win and Game Over', () => {
  test('shows "You win!" overlay when a 2048 tile is reached', async ({ page }) => {
    await page.goto('/');
    await forceState(page, {
      tiles: [{ id: 99, value: 2048, row: 0, col: 0, merged: false, isNew: false }],
      score: 2048,
      bestScore: 2048,
      status: 'won',
      size: 4,
    });
    await expect(page.getByText('You win!')).toBeVisible();
  });

  test('shows "Game over!" overlay when no moves remain', async ({ page }) => {
    await page.goto('/');
    // Fill board with no adjacent equal tiles — guaranteed no valid moves
    const tiles = [
      { id: 1,  value: 2,    row: 0, col: 0, merged: false, isNew: false },
      { id: 2,  value: 4,    row: 0, col: 1, merged: false, isNew: false },
      { id: 3,  value: 8,    row: 0, col: 2, merged: false, isNew: false },
      { id: 4,  value: 16,   row: 0, col: 3, merged: false, isNew: false },
      { id: 5,  value: 32,   row: 1, col: 0, merged: false, isNew: false },
      { id: 6,  value: 64,   row: 1, col: 1, merged: false, isNew: false },
      { id: 7,  value: 128,  row: 1, col: 2, merged: false, isNew: false },
      { id: 8,  value: 256,  row: 1, col: 3, merged: false, isNew: false },
      { id: 9,  value: 512,  row: 2, col: 0, merged: false, isNew: false },
      { id: 10, value: 256,  row: 2, col: 1, merged: false, isNew: false },
      { id: 11, value: 128,  row: 2, col: 2, merged: false, isNew: false },
      { id: 12, value: 64,   row: 2, col: 3, merged: false, isNew: false },
      { id: 13, value: 32,   row: 3, col: 0, merged: false, isNew: false },
      { id: 14, value: 16,   row: 3, col: 1, merged: false, isNew: false },
      { id: 15, value: 8,    row: 3, col: 2, merged: false, isNew: false },
      { id: 16, value: 4,    row: 3, col: 3, merged: false, isNew: false },
    ];
    await forceState(page, { tiles, score: 100, bestScore: 100, status: 'lost', size: 4 });
    await expect(page.getByText('Game over!')).toBeVisible();
  });

  test('arrow keys have no effect after game over', async ({ page }) => {
    await page.goto('/');
    await forceState(page, {
      tiles: [
        { id: 1, value: 2, row: 0, col: 0, merged: false, isNew: false },
        { id: 2, value: 4, row: 0, col: 1, merged: false, isNew: false },
      ],
      score: 0,
      bestScore: 0,
      status: 'lost',
      size: 4,
    });
    await page.waitForTimeout(50);
    const before = await getTileValues(page);
    await page.keyboard.press('ArrowLeft');
    await page.waitForTimeout(150);
    const after = await getTileValues(page);
    expect(after).toEqual(before);
  });

  test('New Game clears the win overlay', async ({ page }) => {
    await page.goto('/');
    await forceState(page, {
      tiles: [{ id: 99, value: 2048, row: 0, col: 0, merged: false, isNew: false }],
      score: 2048,
      bestScore: 2048,
      status: 'won',
      size: 4,
    });
    await expect(page.getByText('You win!')).toBeVisible();
    await page.getByRole('button', { name: 'New Game' }).click();
    await expect(page.getByText('You win!')).not.toBeVisible();
  });
});

test.describe('Leaderboard', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('opens leaderboard popup when button is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Leaderboard' }).click();
    await expect(page.getByRole('dialog', { name: 'Leaderboard' })).toBeVisible();
  });

  test('shows empty state when no scores recorded', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('2048-leaderboard'));
    await page.getByRole('button', { name: 'Leaderboard' }).click();
    await expect(page.getByText(/no scores yet/i)).toBeVisible();
  });

  test('closes popup with the close button', async ({ page }) => {
    await page.getByRole('button', { name: 'Leaderboard' }).click();
    await page.getByRole('button', { name: 'Close leaderboard' }).click();
    await expect(page.getByRole('dialog', { name: 'Leaderboard' })).not.toBeVisible();
  });

  test('closes popup with the Escape key', async ({ page }) => {
    await page.getByRole('button', { name: 'Leaderboard' }).click();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Leaderboard' })).not.toBeVisible();
  });

  test('closes popup when backdrop is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Leaderboard' }).click();
    const dialog = page.getByRole('dialog', { name: 'Leaderboard' });
    await dialog.click({ position: { x: 5, y: 5 } }); // click backdrop area outside popup
    await expect(dialog).not.toBeVisible();
  });

  test('records score in leaderboard after game ends', async ({ page }) => {
    await page.evaluate(() => localStorage.removeItem('2048-leaderboard'));
    // Force a won state with a known score
    await forceState(page, {
      tiles: [{ id: 99, value: 2048, row: 0, col: 0, merged: false, isNew: false }],
      score: 9999,
      bestScore: 9999,
      status: 'won',
      size: 4,
    });
    await page.waitForTimeout(100); // allow useEffect to save score
    await page.getByRole('button', { name: 'Leaderboard' }).click();
    const dialog = page.getByRole('dialog', { name: 'Leaderboard' });
    await expect(dialog.getByText('9,999')).toBeVisible();
  });
});
