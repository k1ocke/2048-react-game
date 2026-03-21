import type { CurrentUser } from '../types/multiplayer';
import { isGuest } from '../types/multiplayer';
import styles from './UserBadge.module.css';

interface UserBadgeProps {
  user: CurrentUser | null;
  isLoading: boolean;
  onSignInClick: () => void;
  onProfileClick: () => void;
}

const getInitials = (username: string): string => {
  const trimmed = username.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 2).toUpperCase();
};

const UserBadge = ({ user, isLoading, onSignInClick, onProfileClick }: UserBadgeProps) => {
  if (isLoading) return null;

  if (!user || isGuest(user)) {
    return (
      <div className={styles.guestRow}>
        <span className={styles.guestLabel}>Guest</span>
        <button
          type="button"
          className={styles.signUpBtn}
          onClick={onSignInClick}
          aria-label="Sign up or log in"
        >
          Sign up
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      className={styles.userBtn}
      onClick={onProfileClick}
      aria-label={`Open profile for ${user.username}`}
    >
      <span className={styles.avatar} aria-hidden="true">
        {getInitials(user.username)}
      </span>
      <span className={styles.username}>{user.username}</span>
    </button>
  );
};

export default UserBadge;
