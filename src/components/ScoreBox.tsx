import styles from './ScoreBox.module.css';

interface ScoreBoxProps {
  label: string;
  value: number;
  isNewRecord?: boolean;
}

const ScoreBox = ({ label, value, isNewRecord }: ScoreBoxProps) => (
  <div className={`${styles.box} ${isNewRecord ? styles.newRecord : ''}`}>
    <span className={styles.label}>{label}</span>
    <span className={styles.value}>{value.toLocaleString()}</span>
    {isNewRecord && <span className={styles.badge}>Best!</span>}
  </div>
);

export default ScoreBox;
