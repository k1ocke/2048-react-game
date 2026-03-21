import { memo, useEffect, useRef, useState } from 'react';
import styles from './ScoreBox.module.css';

interface ScoreBoxProps {
  label: string;
  value: number;
  isNewRecord?: boolean;
}

const ScoreBox = memo(({ label, value, isNewRecord }: ScoreBoxProps) => {
  const prevValueRef = useRef(value);
  const [delta, setDelta] = useState<number | null>(null);
  const deltaKeyRef = useRef(0);

  useEffect(() => {
    const diff = value - prevValueRef.current;
    prevValueRef.current = value;
    if (diff > 0) {
      deltaKeyRef.current += 1;
      setDelta(diff);
    }
  }, [value]);

  return (
    <div className={`${styles.box} ${isNewRecord ? styles.newRecord : ''}`} style={{ position: 'relative' }}>
      <span className={styles.label}>{label}</span>
      <span className={styles.value}>{value.toLocaleString()}</span>
      {isNewRecord && <span className={styles.badge}>Best!</span>}
      {delta !== null && (
        <span
          key={deltaKeyRef.current}
          className={styles.delta}
          onAnimationEnd={() => setDelta(null)}
          aria-hidden="true"
        >
          +{delta.toLocaleString()}
        </span>
      )}
    </div>
  );
});

export default ScoreBox;
