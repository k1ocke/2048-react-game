import { useState } from 'react';
import styles from './RoomCodeDisplay.module.css';

interface RoomCodeDisplayProps {
  code: string;
}

const RoomCodeDisplay = ({ code }: RoomCodeDisplayProps) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  return (
    <div className={styles.wrapper}>
      <span className={styles.code}>{code}</span>
      <button
        className={styles.copyBtn}
        onClick={handleCopy}
        aria-label="Copy room code"
      >
        {copied ? 'Copied!' : (
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
            <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
          </svg>
        )}
      </button>
    </div>
  );
};

export default RoomCodeDisplay;
