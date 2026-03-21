import { test, expect, type Page } from '@playwright/test';

// ─── Test fixtures ───────────────────────────────────────────────────────────

const FAKE_USER_ID = 'test-user-1';
const FAKE_USERNAME = 'Guest-TEST1234';

/**
 * Fake JWT — the browser code only reads the base64 payload to extract `sub`.
 * Standard base64 (not base64url) so browser's atob() can decode it.
 */
const FAKE_TOKEN = [
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
  Buffer.from(
    JSON.stringify({ sub: FAKE_USER_ID, username: FAKE_USERNAME, isGuest: true, iat: 1700000000, exp: 9999999999 }),
  ).toString('base64'),
  'fakesig',
].join('.');

const FAKE_GUEST_USER = { id: FAKE_USER_ID, username: FAKE_USERNAME, isGuest: true };

const MOCK_ROOM_WAITING = {
  id: 'ABC123',
  hostId: FAKE_USER_ID,
  maxPlayers: 2,
  status: 'waiting',
  createdAt: new Date().toISOString(),
  players: [{ userId: FAKE_USER_ID, username: FAKE_USERNAME, isHost: true, isReady: false }],
};

const MOCK_ROOM_TWO_PLAYERS = {
  ...MOCK_ROOM_WAITING,
  players: [
    { userId: FAKE_USER_ID, username: FAKE_USERNAME, isHost: true, isReady: false },
    { userId: 'opponent-1', username: 'Bob', isHost: false, isReady: false },
  ],
};

const MOCK_ROOM_PLAYING = { ...MOCK_ROOM_TWO_PLAYERS, status: 'playing' };

const MOCK_RANKINGS = [
  { userId: FAKE_USER_ID, username: FAKE_USERNAME, score: 8192, rank: 1 },
  { userId: 'opponent-1', username: 'Bob', score: 4096, rank: 2 },
];

// ─── Helpers ─────────────────────────────────────────────────────────────────

type WsHandler = (msg: Record<string, unknown>, send: (data: object) => void) => void;

/**
 * Set up HTTP mocks, a WebSocket mock, and inject the auth token into
 * localStorage before page load. Pass `wsHandler` to react to WS messages.
 */
const setupMocks = async (page: Page, wsHandler?: WsHandler): Promise<void> => {
  // Restore session: /api/v1/me returns the fake guest user
  await page.route('**/api/v1/me', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(FAKE_GUEST_USER) }),
  );

  // Guest login endpoint
  await page.route('**/api/v1/auth/guest', (route) =>
    route.fulfill({
      status: 201,
      contentType: 'application/json',
      body: JSON.stringify({ token: FAKE_TOKEN, user: FAKE_GUEST_USER }),
    }),
  );

  // WebSocket mock — Playwright intercepts before the Vite proxy reaches :4000
  await page.routeWebSocket('**/ws', (ws) => {
    const send = (msg: object) => ws.send(JSON.stringify(msg));
    ws.onMessage((data) => {
      const msg = JSON.parse(data as string) as Record<string, unknown>;
      wsHandler?.(msg, send);
    });
  });

  // Inject token into localStorage before the page loads so useAuth can restore the session
  await page.addInitScript(([key, token]: string[]) => {
    localStorage.setItem(key, token);
  }, ['2048-auth-token', FAKE_TOKEN]);
};

/**
 * Navigate to the app as an authenticated (guest) user.
 * Waits until the Multiplayer button is enabled (user state loaded).
 */
const gotoAuthenticated = async (page: Page, wsHandler?: WsHandler): Promise<void> => {
  await setupMocks(page, wsHandler);
  await page.goto('/');
  // Tiles are purely visual and must not intercept clicks on underlying buttons.
  // Injected after navigation so document.head is available and the rule is
  // guaranteed to apply to all present and future tile elements.
  await page.evaluate(() => {
    const s = document.createElement('style');
    s.textContent = '[aria-label^="Tile with value"] { pointer-events: none !important; }';
    document.head.appendChild(s);
  });
  await expect(page.getByRole('button', { name: 'Open multiplayer lobby' })).toBeEnabled({ timeout: 5000 });
};

/**
 * Open the Multiplayer lobby and wait for the WebSocket to connect.
 * Waits for the Create button to become enabled (= "Connected" state).
 */
const openLobby = async (page: Page): Promise<void> => {
  // force: true bypasses any residual tile overlap that the CSS injection may
  // not have eliminated before React renders the button's first frame.
  await page.getByRole('button', { name: 'Open multiplayer lobby' }).click({ force: true });
  await expect(page.getByRole('dialog', { name: 'Multiplayer Lobby' })).toBeVisible();
  // Create button is disabled while connecting; becomes enabled once the WS is open
  await expect(page.getByRole('button', { name: 'Create' })).toBeEnabled({ timeout: 3000 });
};

/**
 * Open the lobby and create a room. Expects the wsHandler to respond to
 * `room:create` with a `room:state` message showing a waiting room.
 */
const createAndEnterRoom = async (page: Page): Promise<void> => {
  await openLobby(page);
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByText('Waiting Room')).toBeVisible();
};

// ─── Auth gate ───────────────────────────────────────────────────────────────

test.describe('Auth gate', () => {
  test('Multiplayer button is disabled when not signed in', async ({ page }) => {
    await page.goto('/');
    const btn = page.getByRole('button', { name: 'Open multiplayer lobby' });
    await expect(btn).toBeDisabled();
    await expect(btn).toHaveAttribute('title', 'Sign in to play multiplayer');
  });

  test('Multiplayer button is enabled after signing in as guest', async ({ page }) => {
    await page.route('**/api/v1/auth/guest', (route) =>
      route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ token: FAKE_TOKEN, user: FAKE_GUEST_USER }),
      }),
    );
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Open multiplayer lobby' })).toBeDisabled();

    // Open auth modal via the UserBadge "Sign up" button
    await page.getByRole('button', { name: 'Sign up or log in' }).click();
    await expect(page.getByRole('dialog', { name: 'Login' })).toBeVisible();
    await page.getByRole('button', { name: /continue as guest/i }).click();

    await expect(page.getByRole('button', { name: 'Open multiplayer lobby' })).toBeEnabled({ timeout: 3000 });
  });
});

// ─── Lobby modal ─────────────────────────────────────────────────────────────

test.describe('Lobby modal', () => {
  test.beforeEach(async ({ page }) => {
    await gotoAuthenticated(page);
  });

  test('opens when Multiplayer is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Open multiplayer lobby' }).click();
    await expect(page.getByRole('dialog', { name: 'Multiplayer Lobby' })).toBeVisible();
  });

  test('shows Create Room and Join Room sections', async ({ page }) => {
    await page.getByRole('button', { name: 'Open multiplayer lobby' }).click();
    await expect(page.getByRole('heading', { name: 'Create Room' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Join Room' })).toBeVisible();
  });

  test('shows WebSocket Connected status', async ({ page }) => {
    await openLobby(page);
    await expect(page.getByText('Connected')).toBeVisible();
  });

  test('closes with Escape key', async ({ page }) => {
    await page.getByRole('button', { name: 'Open multiplayer lobby' }).click();
    await expect(page.getByRole('dialog', { name: 'Multiplayer Lobby' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Multiplayer Lobby' })).not.toBeVisible();
  });

  test('closes with the close button', async ({ page }) => {
    await page.getByRole('button', { name: 'Open multiplayer lobby' }).click();
    await page.getByRole('button', { name: 'Close lobby' }).click();
    await expect(page.getByRole('dialog', { name: 'Multiplayer Lobby' })).not.toBeVisible();
  });

  test('closes when the backdrop is clicked', async ({ page }) => {
    await page.getByRole('button', { name: 'Open multiplayer lobby' }).click();
    const dialog = page.getByRole('dialog', { name: 'Multiplayer Lobby' });
    await dialog.click({ position: { x: 5, y: 5 } });
    await expect(dialog).not.toBeVisible();
  });

  test('Join button is disabled when the code input is empty', async ({ page }) => {
    await openLobby(page);
    await expect(page.getByRole('button', { name: 'Join' })).toBeDisabled();
  });
});

// ─── Create room flow ─────────────────────────────────────────────────────────

test.describe('Create room flow', () => {
  test('creates a room and shows the waiting room with room code', async ({ page }) => {
    await gotoAuthenticated(page, (msg, send) => {
      if (msg.type === 'room:create') send({ type: 'room:state', room: MOCK_ROOM_WAITING });
    });
    await createAndEnterRoom(page);
    await expect(page.getByText('ABC123')).toBeVisible();
  });

  test('waiting room shows host badge on the creator', async ({ page }) => {
    await gotoAuthenticated(page, (msg, send) => {
      if (msg.type === 'room:create') send({ type: 'room:state', room: MOCK_ROOM_WAITING });
    });
    await createAndEnterRoom(page);
    await expect(page.getByText('Host')).toBeVisible();
  });

  test('waiting room shows correct player count', async ({ page }) => {
    await gotoAuthenticated(page, (msg, send) => {
      if (msg.type === 'room:create') send({ type: 'room:state', room: MOCK_ROOM_WAITING });
    });
    await createAndEnterRoom(page);
    await expect(page.getByText('Players (1/2)')).toBeVisible();
  });

  test('second player joining updates the player list', async ({ page }) => {
    let sendToClient: ((msg: object) => void) | undefined;
    await gotoAuthenticated(page, (msg, send) => {
      sendToClient = send;
      if (msg.type === 'room:create') send({ type: 'room:state', room: MOCK_ROOM_WAITING });
    });
    await createAndEnterRoom(page);
    await expect(page.getByText('Players (1/2)')).toBeVisible();

    // Server pushes the updated room state with Bob
    sendToClient!({ type: 'room:state', room: MOCK_ROOM_TWO_PLAYERS });

    await expect(page.getByText('Players (2/2)')).toBeVisible();
    await expect(page.getByText('Bob')).toBeVisible();
  });

  test('Ready button marks the player as ready', async ({ page }) => {
    await gotoAuthenticated(page, (msg, send) => {
      if (msg.type === 'room:create') send({ type: 'room:state', room: MOCK_ROOM_WAITING });
      if (msg.type === 'room:ready') {
        send({
          type: 'room:state',
          room: { ...MOCK_ROOM_WAITING, players: [{ ...MOCK_ROOM_WAITING.players[0], isReady: true }] },
        });
      }
    });
    await createAndEnterRoom(page);
    await page.getByRole('button', { name: 'Ready', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Ready ✓' })).toBeVisible();
  });

  test('Leave Room button closes the lobby', async ({ page }) => {
    await gotoAuthenticated(page, (msg, send) => {
      if (msg.type === 'room:create') send({ type: 'room:state', room: MOCK_ROOM_WAITING });
    });
    await createAndEnterRoom(page);
    await page.getByRole('button', { name: 'Leave Room' }).click();
    await expect(page.getByRole('dialog', { name: 'Multiplayer Lobby' })).not.toBeVisible();
  });
});

// ─── Join room flow ───────────────────────────────────────────────────────────

test.describe('Join room flow', () => {
  test('joins a room with a valid code and shows the waiting room', async ({ page }) => {
    await gotoAuthenticated(page, (msg, send) => {
      if (msg.type === 'room:join') {
        send({
          type: 'room:state',
          room: {
            ...MOCK_ROOM_TWO_PLAYERS,
            hostId: 'opponent-1',
            players: [
              { userId: 'opponent-1', username: 'Bob', isHost: true, isReady: false },
              { userId: FAKE_USER_ID, username: FAKE_USERNAME, isHost: false, isReady: false },
            ],
          },
        });
      }
    });
    await openLobby(page);
    await page.getByLabel('Room code').fill('XYZ789');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByText('Waiting Room')).toBeVisible();
    await expect(page.getByText('Bob')).toBeVisible();
  });

  test('shows an error when the room code is not found', async ({ page }) => {
    await gotoAuthenticated(page, (msg, send) => {
      if (msg.type === 'room:join') send({ type: 'room:error', code: 'NOT_FOUND', message: 'Room not found' });
    });
    await openLobby(page);
    await page.getByLabel('Room code').fill('XXXXXX');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('alert')).toContainText('Room not found — check the code and try again.');
  });

  test('shows an error when the room is full', async ({ page }) => {
    await gotoAuthenticated(page, (msg, send) => {
      if (msg.type === 'room:join') send({ type: 'room:error', code: 'JOIN_FAILED', message: 'Room is full' });
    });
    await openLobby(page);
    await page.getByLabel('Room code').fill('XXXXXX');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('alert')).toContainText('full or unavailable');
  });

  test('shows an error when the game has already started', async ({ page }) => {
    await gotoAuthenticated(page, (msg, send) => {
      if (msg.type === 'room:join') send({ type: 'room:error', code: 'ALREADY_STARTED', message: 'Already started' });
    });
    await openLobby(page);
    await page.getByLabel('Room code').fill('XXXXXX');
    await page.getByRole('button', { name: 'Join' }).click();
    await expect(page.getByRole('alert')).toContainText('already started');
  });
});

// ─── Game lifecycle ───────────────────────────────────────────────────────────

test.describe('Game lifecycle', () => {
  /** Helper: get from lobby open to a playing game via ready-up. */
  const setupAndStartGame = async (page: Page, sendToClientRef: { current?: (msg: object) => void }): Promise<void> => {
    let gameStarted = false;
    await gotoAuthenticated(page, (msg, send) => {
      sendToClientRef.current = send;
      if (msg.type === 'room:create') send({ type: 'room:state', room: MOCK_ROOM_TWO_PLAYERS });
      if (msg.type === 'room:ready' && !gameStarted) {
        gameStarted = true;
        send({ type: 'game:start', startsAt: new Date().toISOString() });
        send({ type: 'room:state', room: MOCK_ROOM_PLAYING });
      }
    });
    await createAndEnterRoom(page);
    await page.getByRole('button', { name: 'Ready', exact: true }).click();
  };

  test('game:start transitions lobby → MultiplayerPanel', async ({ page }) => {
    const ref: { current?: (msg: object) => void } = {};
    await setupAndStartGame(page, ref);

    await expect(page.getByRole('dialog', { name: 'Multiplayer Lobby' })).not.toBeVisible({ timeout: 3000 });
    await expect(page.getByRole('button', { name: 'Leave Game' })).toBeVisible();
  });

  test('Leave Game from MultiplayerPanel leaves the room', async ({ page }) => {
    const ref: { current?: (msg: object) => void } = {};
    await setupAndStartGame(page, ref);

    await expect(page.getByRole('button', { name: 'Leave Game' })).toBeVisible();
    await page.getByRole('button', { name: 'Leave Game' }).click();
    await expect(page.getByRole('button', { name: 'Leave Game' })).not.toBeVisible();
  });

  test('game:end shows PostGameModal with final rankings', async ({ page }) => {
    const ref: { current?: (msg: object) => void } = {};
    await setupAndStartGame(page, ref);

    await expect(page.getByRole('button', { name: 'Leave Game' })).toBeVisible();
    ref.current!({ type: 'game:end', rankings: MOCK_RANKINGS });

    const modal = page.getByRole('dialog', { name: 'Game Results' });
    await expect(modal).toBeVisible({ timeout: 3000 });
    // Winner announcement
    await expect(modal.getByText(/wins with/)).toBeVisible();
    // Both players appear in the rankings list
    await expect(modal.getByRole('listitem').filter({ hasText: '8,192' })).toBeVisible();
    await expect(modal.getByRole('listitem').filter({ hasText: '4,096' })).toBeVisible();
    await expect(modal.getByRole('listitem').filter({ hasText: 'Bob' })).toBeVisible();
  });

  test('PostGameModal: Play Again sends room:ready and shows waiting state', async ({ page }) => {
    const ref: { current?: (msg: object) => void } = {};
    let gameStarted = false;
    await gotoAuthenticated(page, (msg, send) => {
      ref.current = send;
      if (msg.type === 'room:create') send({ type: 'room:state', room: MOCK_ROOM_TWO_PLAYERS });
      if (msg.type === 'room:ready') {
        if (!gameStarted) {
          gameStarted = true;
          send({ type: 'game:start', startsAt: new Date().toISOString() });
          send({ type: 'room:state', room: MOCK_ROOM_PLAYING });
        } else {
          // Play Again: transition room back to waiting with current user marked ready
          send({
            type: 'room:state',
            room: {
              ...MOCK_ROOM_TWO_PLAYERS,
              players: [
                { userId: FAKE_USER_ID, username: FAKE_USERNAME, isHost: true, isReady: true },
                { userId: 'opponent-1', username: 'Bob', isHost: false, isReady: false },
              ],
            },
          });
        }
      }
    });
    await createAndEnterRoom(page);
    await page.getByRole('button', { name: 'Ready', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Leave Game' })).toBeVisible();

    ref.current!({ type: 'game:end', rankings: MOCK_RANKINGS });
    await expect(page.getByRole('dialog', { name: 'Game Results' })).toBeVisible();

    await page.getByRole('button', { name: /play again/i }).click();

    // Button should now be disabled and show "Waiting for Bob…"
    const waitingBtn = page.getByRole('button', { name: /waiting for others/i });
    await expect(waitingBtn).toBeVisible({ timeout: 3000 });
    await expect(waitingBtn).toBeDisabled();
    await expect(waitingBtn).toContainText('Bob');
  });

  test('PostGameModal: Leave closes modal and leaves the room', async ({ page }) => {
    const ref: { current?: (msg: object) => void } = {};
    await setupAndStartGame(page, ref);

    await expect(page.getByRole('button', { name: 'Leave Game' })).toBeVisible();
    ref.current!({ type: 'game:end', rankings: MOCK_RANKINGS });

    await expect(page.getByRole('dialog', { name: 'Game Results' })).toBeVisible();
    await page.getByRole('button', { name: 'Leave', exact: true }).click();

    await expect(page.getByRole('dialog', { name: 'Game Results' })).not.toBeVisible();
    // No longer in a multiplayer game — Leave Game panel is gone
    await expect(page.getByRole('button', { name: 'Leave Game' })).not.toBeVisible();
  });

  test('PostGameModal: Escape dismisses the modal without leaving the room', async ({ page }) => {
    const ref: { current?: (msg: object) => void } = {};
    await setupAndStartGame(page, ref);

    ref.current!({ type: 'game:end', rankings: MOCK_RANKINGS });
    await expect(page.getByRole('dialog', { name: 'Game Results' })).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Game Results' })).not.toBeVisible();

    // Still in game — Leave Game button remains
    await expect(page.getByRole('button', { name: 'Leave Game' })).toBeVisible();
  });

  test('PostGameModal: backdrop click dismisses without leaving the room', async ({ page }) => {
    const ref: { current?: (msg: object) => void } = {};
    await setupAndStartGame(page, ref);

    ref.current!({ type: 'game:end', rankings: MOCK_RANKINGS });
    const modal = page.getByRole('dialog', { name: 'Game Results' });
    await expect(modal).toBeVisible();

    await modal.click({ position: { x: 5, y: 5 } });
    await expect(modal).not.toBeVisible();

    await expect(page.getByRole('button', { name: 'Leave Game' })).toBeVisible();
  });
});
