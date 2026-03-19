import { useEffect, useRef, useState } from 'react';
import { useGame } from '../hooks/useGame';
import { useLeaderboard } from '../hooks/useLeaderboard';
import { useScoreHistory } from '../hooks/useScoreHistory';
import Board from './Board';
import ScoreBox from './ScoreBox';
import LeaderboardPopup from './LeaderboardPopup';
import ScoreHistorySidebar from './ScoreHistorySidebar';
import styles from './Game.module.css';

const Game = () => {
  const { state, handleMove, restart } = useGame();
  const { entries, addEntry } = useLeaderboard();
  const { history, addHistoryEntry } = useScoreHistory();
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const scoreSaved = useRef(false);

  useEffect(() => {
    if (state.status !== 'playing' && !scoreSaved.current) {
      scoreSaved.current = true;
      addEntry(state.score);
      addHistoryEntry(state.score, state.status as 'won' | 'lost');
    }
    if (state.status === 'playing') {
      scoreSaved.current = false;
    }
  }, [state.status, state.score, addEntry, addHistoryEntry]);

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
          <h1 className={styles.title}>2048</h1>
          <div className={styles.scores}>
            <ScoreBox label="Score" value={state.score} />
            <ScoreBox label="Best" value={state.bestScore} />
          </div>
        </div>
        <div className={styles.controls}>
          <p className={styles.hint}>Use arrow keys or WASD to move</p>
          <button className={styles.newGame} onClick={restart}>
            New Game
          </button>
        </div>
        <Board state={state} />
        <button
          className={styles.leaderboardBtn}
          onClick={() => setLeaderboardOpen(true)}
          aria-label="View leaderboard"
        >
          Leaderboard
        </button>
      </div>
      <ScoreHistorySidebar history={history} />
      <LeaderboardPopup
        isOpen={leaderboardOpen}
        entries={entries}
        onClose={() => setLeaderboardOpen(false)}
      />
    </div>
  );
};

export default Game;
