import { useMemo } from 'react';
import type { OpponentState } from '../hooks/useMultiplayerGame';
import OpponentBoard from './OpponentBoard';
import styles from './MultiplayerPanel.module.css';

interface MultiplayerPanelProps {
  opponents: OpponentState[];
  myScore: number;
  rankings: Array<{ userId: string; username: string; score: number; rank: number }> | null;
  onLeave: () => void;
  connected: boolean;
}

const MultiplayerPanel = ({ opponents, myScore, rankings, onLeave, connected }: MultiplayerPanelProps) => {
  const highestOpponentScore = useMemo(
    () => (opponents.length > 0 ? Math.max(...opponents.map((o) => o.score)) : -1),
    [opponents],
  );

  return (
    <div className={styles.panel}>
      <p className={styles.panelTitle}>Multiplayer</p>

      {!connected && (
        <p className={styles.reconnecting} role="status">Reconnecting…</p>
      )}

      {rankings === null ? (
        <>
          <div className={styles.myScoreRow}>
            <span className={styles.myScoreLabel}>Your score</span>
            <span className={styles.myScoreValue}>{myScore.toLocaleString()}</span>
          </div>

          {opponents.length === 0 ? (
            <p className={styles.waiting}>Waiting for opponents&hellip;</p>
          ) : (
            <div className={styles.opponentsList}>
              {opponents.map((opponent) => (
                <OpponentBoard
                  key={opponent.userId}
                  opponent={opponent}
                  isWinning={
                    opponent.score === highestOpponentScore &&
                    opponent.score > myScore
                  }
                />
              ))}
            </div>
          )}
        </>
      ) : (
        <div className={styles.rankingsList}>
          {rankings.map((entry) => {
            const isOwn = !opponents.some((o) => o.userId === entry.userId);
            return (
              <div
                key={entry.userId}
                className={`${styles.rankingRow} ${isOwn ? styles.rankingRowOwn : ''}`}
              >
                <span className={`${styles.rank} ${entry.rank === 1 ? styles.rankFirst : ''}`}>
                  #{entry.rank}
                </span>
                <span className={styles.rankingUsername}>{entry.username}</span>
                <span className={styles.rankingScore}>{entry.score.toLocaleString()}</span>
              </div>
            );
          })}
        </div>
      )}

      <button className={styles.leaveBtn} onClick={onLeave}>
        Leave Game
      </button>
    </div>
  );
};

export default MultiplayerPanel;
