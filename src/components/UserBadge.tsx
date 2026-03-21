import { memo } from 'react';
import type { CurrentUser } from '../types/multiplayer';
import { isGuest } from '../types/multiplayer';
import { getInitials } from '../utils/formatters';
import styles from './UserBadge.module.css';

interface UserBadgeProps {
  user: CurrentUser | null;
  isLoading: boolean;
  onSignInClick: () => void;
  onProfileClick: () => void;
}

const UserBadge = memo(({ user, isLoading, onSignInClick, onProfileClick }: UserBadgeProps) => {
  if (isLoading) {
    return <div className={styles.skeleton} aria-hidden="true" />;
  }

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
});

export default UserBadge;
