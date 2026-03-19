import styles from './ScoreBox.module.css';

interface ScoreBoxProps {
  label: string;
  value: number;
}

const ScoreBox = ({ label, value }: ScoreBoxProps) => (
  <div className={styles.box}>
    <span className={styles.label}>{label}</span>
    <span className={styles.value}>{value}</span>
  </div>
);

export default ScoreBox;
