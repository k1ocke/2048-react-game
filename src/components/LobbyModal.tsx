import { useEffect, useRef, useState } from 'react';
import type { ClientMessage, GameRoom } from '../types/multiplayer';
import { getInitials } from '../utils/formatters';
import RoomCodeDisplay from './RoomCodeDisplay';
import styles from './LobbyModal.module.css';

interface LobbyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRoomReady: (roomId: string) => void;
  sendMessage: (msg: ClientMessage) => void;
  leaveRoom: () => void;
  room: GameRoom | null;
  connected: boolean;
  currentUserId: string;
  error: string | null;
}

const LobbyModal = ({
  isOpen,
  onClose,
  onRoomReady,
  sendMessage,
  leaveRoom,
  room,
  connected,
  currentUserId,
  error,
}: LobbyModalProps) => {
  const [maxPlayers, setMaxPlayers] = useState<2 | 3 | 4>(2);
  const [joinCode, setJoinCode] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  // Transition to playing state
  useEffect(() => {
    if (room?.status === 'playing') {
      onRoomReady(room.id);
      onClose();
    }
  }, [room?.status, room?.id, onRoomReady, onClose]);

  if (!isOpen) return null;

  const handleCreate = () => {
    sendMessage({ type: 'room:create', maxPlayers });
  };

  const handleJoin = () => {
    if (joinCode.trim().length === 0) return;
    sendMessage({ type: 'room:join', roomId: joinCode.toUpperCase() });
  };

  const handleLeave = () => {
    leaveRoom();
    onClose();
  };

  const handleReady = () => {
    sendMessage({ type: 'room:ready' });
  };

  const currentPlayer = room?.players.find((p) => p.userId === currentUserId);
  const readyCount = room?.players.filter((p) => p.isReady).length ?? 0;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Multiplayer Lobby"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} ref={dialogRef}>
        <div className={styles.header}>
          <h2 className={styles.title}>
            {room ? 'Waiting Room' : 'Multiplayer'}
          </h2>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close lobby"
          >
            ✕
          </button>
        </div>

        {/* Connection status */}
        <div className={styles.connectionStatus}>
          <span
            className={connected ? styles.dotConnected : styles.dotConnecting}
            aria-hidden="true"
          />
          <span className={styles.connectionText}>
            {connected ? 'Connected' : 'Connecting…'}
          </span>
        </div>

        {error && (
          <p className={styles.errorBanner} role="alert">{error}</p>
        )}

        {room === null ? (
          /* ── View A: Entry ── */
          <div className={styles.entryView}>
            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Create Room</h3>
              <div className={styles.row}>
                <label htmlFor="maxPlayers" className={styles.label}>
                  Max players
                </label>
                <select
                  id="maxPlayers"
                  className={styles.select}
                  value={maxPlayers}
                  onChange={(e) => setMaxPlayers(Number(e.target.value) as 2 | 3 | 4)}
                  disabled={!connected}
                >
                  <option value={2}>2 players</option>
                  <option value={3}>3 players</option>
                  <option value={4}>4 players</option>
                </select>
              </div>
              <button
                className={styles.primaryBtn}
                onClick={handleCreate}
                disabled={!connected}
              >
                {connected ? 'Create' : 'Connecting…'}
              </button>
            </section>

            <div className={styles.divider} aria-hidden="true">
              <span>or</span>
            </div>

            <section className={styles.section}>
              <h3 className={styles.sectionTitle}>Join Room</h3>
              <input
                className={styles.input}
                type="text"
                placeholder="Enter 6-char code"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value)}
                disabled={!connected}
                aria-label="Room code"
              />
              <button
                className={styles.primaryBtn}
                onClick={handleJoin}
                disabled={!connected || joinCode.trim().length === 0}
              >
                {connected ? 'Join' : 'Connecting…'}
              </button>
            </section>
          </div>
        ) : (
          /* ── View B: Waiting Room ── */
          <div className={styles.waitingView}>
            <div className={styles.codeSection}>
              <p className={styles.codeLabel}>Room Code</p>
              <RoomCodeDisplay code={room.id} />
            </div>

            <div className={styles.playerList}>
              <p className={styles.playerListLabel}>
                Players ({room.players.length}/{room.maxPlayers})
              </p>
              <ul className={styles.players} aria-label="Players in room">
                {room.players.map((player) => (
                  <li key={player.userId} className={styles.playerRow}>
                    <div className={styles.avatar}>
                      {getInitials(player.username)}
                    </div>
                    <span className={styles.playerName}>{player.username}</span>
                    {player.isHost && (
                      <span className={styles.hostBadge}>Host</span>
                    )}
                    <span
                      className={player.isReady ? styles.readyDot : styles.notReadyDot}
                      aria-label={player.isReady ? 'Ready' : 'Not ready'}
                    />
                  </li>
                ))}
              </ul>
            </div>

            <div className={styles.waitingActions}>
              <button
                className={
                  currentPlayer?.isReady ? styles.readyBtnActive : styles.readyBtn
                }
                onClick={handleReady}
              >
                {currentPlayer?.isReady ? 'Ready ✓' : 'Ready'}
              </button>

              {currentPlayer?.isHost && (
                <button
                  className={styles.startBtn}
                  disabled
                  title="Game starts automatically when all players are ready"
                >
                  Start Game ({readyCount}/{room.players.length} ready)
                </button>
              )}

              <button className={styles.leaveBtn} onClick={handleLeave}>
                Leave Room
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default LobbyModal;
