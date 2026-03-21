import { useCallback, useEffect, useRef, useState } from 'react';
import type { Direction } from '../types/game';
import { useGame } from '../hooks/useGame';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useScoreHistory } from '../hooks/useScoreHistory';
import { useAuth } from '../hooks/useAuth';
import { useMultiplayerGame } from '../hooks/useMultiplayerGame';
import { useGameStats } from '../hooks/useGameStats';
import { useMatchHistory } from '../hooks/useMatchHistory';
import { useMultiplayerScoreSync } from '../hooks/useMultiplayerScoreSync';
import { useTouchControls } from '../hooks/useTouchControls';
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
  const { user, isLoading, token, login, register, loginAsGuest, logout, upgradeGuest, updateUsername, refreshUser } = useAuth();
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [lobbyOpen, setLobbyOpen] = useState(false);
  const [authOpen, setAuthOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const boardRef = useRef<HTMLDivElement>(null);

  const { connected, room, sendMessage, leaveRoom, opponents, rankings, error: multiplayerError, gameStartCount } =
    useMultiplayerGame(token);

  // Forward moves to the server when in an active multiplayer game
  const onMove = useCallback((direction: Direction) => {
    if (room?.status === 'playing') {
      sendMessage({ type: 'game:move', direction });
    }
  }, [room?.status, sendMessage]);

  const { matchHistory, postGameOpen, setPostGameOpen } = useMatchHistory(rankings, room);

  const isModalOpen = lobbyOpen || authOpen || profileOpen || (postGameOpen && matchHistory.length > 0);
  const { state, handleMove, restart } = useGame(onMove, isModalOpen);
  const currentUserId = user?.id ?? '';

  const { isNewRecord } = useGameStats(state, token, refreshUser, addEntry, addHistoryEntry);
  useMultiplayerScoreSync(state, sendMessage, room);
  useTouchControls(handleMove, boardRef);

  // U6: Call restart() when game:start arrives from server (not immediately on "Play Again")
  const prevGameStartCount = useRef(gameStartCount);
  useEffect(() => {
    if (gameStartCount > 0 && gameStartCount !== prevGameStartCount.current) {
      prevGameStartCount.current = gameStartCount;
      restart();
    }
  }, [gameStartCount, restart]);

  const handleLogout = useCallback(() => { logout(); setProfileOpen(false); }, [logout]);
  // U6: Remove restart() from handlePlayAgain — restart fires on game:start
  const handlePlayAgain = useCallback(() => { sendMessage({ type: 'room:ready' }); }, [sendMessage]);
  const handlePostGameClose = useCallback(() => { setPostGameOpen(false); }, [setPostGameOpen]);
  const handlePostGameLeave = useCallback(() => { setPostGameOpen(false); leaveRoom(); }, [leaveRoom, setPostGameOpen]);

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
        {/* U4: pass boardRef; U7: hide overlay during active multiplayer */}
        <div ref={boardRef}>
          <Board state={state} hideStatusOverlay={room?.status === 'playing'} />
        </div>
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
          connected={connected}
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
          onLogout={handleLogout}
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
          onPlayAgain={handlePlayAgain}
          onLeave={handlePostGameLeave}
          onClose={handlePostGameClose}
        />
      )}
    </div>
  );
};

export default Game;
