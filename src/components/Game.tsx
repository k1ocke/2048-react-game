import { useCallback, useEffect, useRef, useState } from 'react';
import type { Direction } from '../types/game';
import { useGame } from '../hooks/useGame';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useScoreHistory } from '../hooks/useScoreHistory';
import { useAuth } from '../hooks/useAuth';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import Board from './Board';
import ScoreBox from './ScoreBox';
import LeaderboardPopup from './LeaderboardPopup';
import ScoreHistorySidebar from './ScoreHistorySidebar';
import MultiplayerPanel from './MultiplayerPanel';
import LobbyModal from './LobbyModal';
import PostGameModal from './PostGameModal';
import AuthModal from './AuthModal';
import UserBadge from './UserBadge';
import ProfilePanel from './ProfilePanel';
import styles from './Game.module.css';

const Game = () => {
  const { entries, addEntry } = useLeaderboard();
  const { history, addHistoryEntry } = useScoreHistory();
  const { user, isLoading, login, register, loginAsGuest, logout, upgradeGuest, updateUsername, refreshUser } = useAuth();
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [postGameOpen, setPostGameOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [matchHistory, setMatchHistory] = useState<Array<{
    rankings: Array<{ userId: string; username: string; score: number; rank: number }>;
    playedAt: Date;
  }>>([]);
  const token = localStorage.getItem('2048-auth-token');
  const { connected, room, sendMessage, leaveRoom, opponents, rankings, error: multiplayerError } =
    useMultiplayerGame(token);

  // Forward moves to the server when in an active multiplayer game
  const onMove = useCallback((direction: Direction) => {
    if (room?.status === 'playing') {
      sendMessage({ type: 'game:move', direction });
    }
  }, [room?.status, sendMessage]);

  const { state, handleMove, restart } = useGame(onMove);
  const currentUserId = user?.id ?? '';
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const scoreSaved = useRef(false);
  const sessionStartBest = useRef(state.bestScore);
  // Ref so the score-update effect always reads the latest room status, not a stale closure
  const roomStatusRef = useRef<string | null>(null);
  roomStatusRef.current = room?.status ?? null;

  // Reset session baseline whenever a new game begins
  useEffect(() => {
    if (state.status === 'playing' && state.score === 0) {
      sessionStartBest.current = state.bestScore;
    }
  }, [state.status, state.score, state.bestScore]);

  // Report score + board to the server on every valid move during a multiplayer game.
  // Fires on state.moves (every move, including non-scoring ones) so the opponent board stays
  // in sync even when tiles rearrange without merging.
  // Uses roomStatusRef (not room?.status directly) to avoid stale closures: if the server
  // resets the room milliseconds after game-end, the ref ensures the final 'lost'/'won'
  // update is always sent so rankings use the real client score rather than the server sim.
  useEffect(() => {
    const roomStatus = roomStatusRef.current;
    // For mid-game updates only send while the room is active; always send the final status.
    if (state.status === 'playing' && roomStatus !== 'playing') return;
    const status = state.status === 'playing' ? 'playing'
      : state.status === 'won' ? 'won'
      : 'lost';
    const board: number[][] = Array.from({ length: state.size }, () => Array(state.size).fill(0));
    for (const tile of state.tiles) {
      board[tile.row][tile.col] = tile.value;
    }
    sendMessage({ type: 'game:score-update', score: state.score, status, board });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.moves, state.status]);

  const isNewRecord = state.score > 0 && state.score > sessionStartBest.current;

  useEffect(() => {
    if (state.status !== 'playing' && !scoreSaved.current) {
      scoreSaved.current = true;
      addEntry(state.score);
      const bestTile = state.tiles.reduce((max, t) => Math.max(max, t.value), 0);
      const duration = Math.round((Date.now() - state.startTime) / 1000);
      addHistoryEntry(state.score, state.status as 'won' | 'lost', {
        moves: state.moves,
        bestTile,
        duration,
      });
      // Submit stats to server for logged-in users
      if (token && state.score > 0) {
        fetch('/api/v1/stats/game-end', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ won: state.status === 'won', score: state.score, moves: state.moves }),
        })
          .then(() => refreshUser())
          .catch((err) => console.error('Failed to submit stats:', err));
      }
    }
    if (state.status === 'playing') {
      scoreSaved.current = false;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.status, state.score, state.moves, state.startTime]);

  // Save match to history and show PostGameModal when rankings arrive
  useEffect(() => {
    if (rankings) {
      setMatchHistory((prev) => [...prev, { rankings, playedAt: new Date() }]);
      setPostGameOpen(true);
    }
  }, [rankings]);

  // Auto-close PostGameModal only when room transitions from waiting → playing
  // (i.e. all players clicked Play Again and a new game started)
  const prevRoomStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const prev = prevRoomStatusRef.current;
    prevRoomStatusRef.current = room?.status ?? null;
    if (room?.status === 'playing' && prev === 'waiting' && postGameOpen) {
      setPostGameOpen(false);
    }
  }, [room?.status, postGameOpen]);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      const t = e.touches[0];
      touchStart.current = { x: t.clientX, y: t.clientY };
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!touchStart.current) return;
      const dx = e.changedTouches[0].clientX - touchStart.current.x;
      const dy = e.changedTouches[0].clientY - touchStart.current.y;
      touchStart.current = null;
      if (Math.abs(dx) < 20 && Math.abs(dy) < 20) return;
      if (Math.abs(dx) > Math.abs(dy)) {
        handleMove(dx > 0 ? 'right' : 'left');
      } else {
        handleMove(dy > 0 ? 'down' : 'up');
      }
    };

    window.addEventListener('touchstart', onTouchStart);
    window.addEventListener('touchend', onTouchEnd);
    return () => {
      window.removeEventListener('touchstart', onTouchStart);
      window.removeEventListener('touchend', onTouchEnd);
    };
  }, [handleMove]);

  return (
    <div className={styles.container}>
      <div className={styles.gameArea}>
        <div className={styles.header}>
          <div className={styles.headerTop}>
            <h1 className={styles.title}>2048</h1>
            <UserBadge
              user={user}
              isLoading={isLoading}
              onSignInClick={() => setAuthOpen(true)}
              onProfileClick={() => setProfileOpen(true)}
            />
          </div>
          <div className={styles.scores}>
            <ScoreBox label="Score" value={state.score} />
            <ScoreBox label="Best" value={state.bestScore} isNewRecord={isNewRecord} />
          </div>
        </div>
        <div className={styles.controls}>
          <p className={styles.hint}>Use arrow keys or WASD to move</p>
          <button className={styles.newGame} onClick={restart}>
            New Game
          </button>
        </div>
        <Board state={state} />
        <div className={styles.bottomBtns}>
          <button
            className={styles.leaderboardBtn}
            onClick={() => setLeaderboardOpen(true)}
            aria-label="View leaderboard"
          >
            Leaderboard
          </button>
          <button
            className={styles.leaderboardBtn}
            onClick={() => setLobbyOpen(true)}
            disabled={!user}
            title={!user ? 'Sign in to play multiplayer' : undefined}
            aria-label="Open multiplayer lobby"
          >
            Multiplayer
          </button>
        </div>
      </div>
      {room?.status === 'playing' ? (
        <MultiplayerPanel
          opponents={opponents}
          myScore={state.score}
          rankings={rankings}
          onLeave={leaveRoom}
        />
      ) : (
        <ScoreHistorySidebar history={history} />
      )}
      <LeaderboardPopup
        isOpen={leaderboardOpen}
        entries={entries}
        onClose={() => setLeaderboardOpen(false)}
        token={token}
        currentUserId={user?.id}
      />
      <LobbyModal
        isOpen={lobbyOpen}
        onClose={() => setLobbyOpen(false)}
        onRoomReady={() => setLobbyOpen(false)}
        sendMessage={sendMessage}
        leaveRoom={leaveRoom}
        room={room}
        connected={connected}
        currentUserId={currentUserId}
        error={multiplayerError}
      />
      <AuthModal
        isOpen={authOpen}
        onClose={() => setAuthOpen(false)}
        onLogin={login}
        onRegister={register}
        onLoginAsGuest={loginAsGuest}
      />
      {user && profileOpen && (
        <ProfilePanel
          onClose={() => setProfileOpen(false)}
          user={user}
          onLogout={() => { logout(); setProfileOpen(false); }}
          onUpgrade={upgradeGuest}
          onUpdateUsername={updateUsername}
          onOpen={refreshUser}
        />
      )}
      {postGameOpen && matchHistory.length > 0 && (
        <PostGameModal
          isOpen={postGameOpen}
          rankings={matchHistory[matchHistory.length - 1].rankings}
          history={matchHistory.slice(0, -1)}
          room={room}
          currentUserId={currentUserId}
          onPlayAgain={() => {
            restart();
            sendMessage({ type: 'room:ready' });
          }}
          onLeave={() => {
            setPostGameOpen(false);
            leaveRoom();
          }}
        />
      )}
    </div>
  );
};

export default Game;
