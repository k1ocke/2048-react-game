import { memo, useEffect, useRef, useState } from 'react';
import type { CurrentUser } from '../types/multiplayer';
import { isGuest } from '../types/multiplayer';
import { getInitials } from '../utils/formatters';
import { useFocusTrap } from '../utils/useFocusTrap';
import styles from './ProfilePanel.module.css';

interface ProfilePanelProps {
  user: CurrentUser;
  onClose: () => void;
  onLogout: () => void;
  onUpgrade: (username: string, password: string) => Promise<void>;
  onUpdateUsername: (username: string) => Promise<void>;
  onOpen?: () => void;
}

const ProfilePanel = memo(({ user, onClose, onLogout, onUpgrade, onUpdateUsername, onOpen }: ProfilePanelProps) => {
  const [editingUsername, setEditingUsername] = useState(false);
  const [newUsername, setNewUsername] = useState('');
  const [usernameError, setUsernameError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Upgrade guest state
  const [upgradeUsername, setUpgradeUsername] = useState('');
  const [upgradePassword, setUpgradePassword] = useState('');
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [isUpgrading, setIsUpgrading] = useState(false);

  const panelRef = useRef<HTMLDivElement>(null);
  const usernameInputRef = useRef<HTMLInputElement>(null);

  // ProfilePanel is always open when rendered (parent controls visibility via conditional render)
  useFocusTrap(panelRef, true);

  useEffect(() => {
    onOpen?.();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  useEffect(() => {
    if (editingUsername) {
      setTimeout(() => usernameInputRef.current?.focus(), 50);
    }
  }, [editingUsername]);

  const startEditUsername = () => {
    if (isGuest(user)) return;
    setNewUsername(user.username);
    setUsernameError(null);
    setEditingUsername(true);
  };

  const cancelEditUsername = () => {
    setEditingUsername(false);
    setUsernameError(null);
  };

  const saveUsername = async () => {
    setUsernameError(null);
    setIsSaving(true);
    try {
      await onUpdateUsername(newUsername);
      setEditingUsername(false);
    } catch (err) {
      setUsernameError(err instanceof Error ? err.message : 'Failed to update username.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleUpgrade = async (e: React.FormEvent) => {
    e.preventDefault();
    setUpgradeError(null);
    setIsUpgrading(true);
    try {
      await onUpgrade(upgradeUsername, upgradePassword);
      onClose();
    } catch (err) {
      setUpgradeError(err instanceof Error ? err.message : 'Failed to create account.');
    } finally {
      setIsUpgrading(false);
    }
  };

  const guest = isGuest(user);

  const stats = !guest && 'stats' in user ? user.stats : null;
  const winRate =
    stats && stats.totalGames > 0
      ? Math.round((stats.wins / stats.totalGames) * 100)
      : 0;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label="Profile"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.panel} ref={panelRef}>
        <div className={styles.header}>
          <h2 className={styles.title}>Profile</h2>
          <button
            type="button"
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close profile"
          >
            ✕
          </button>
        </div>

        <div className={styles.avatarSection}>
          <div className={styles.avatarLarge} aria-hidden="true">
            {getInitials(user.username)}
          </div>

          {editingUsername ? (
            <div className={styles.editUsernameRow}>
              <label htmlFor="profile-username" className={styles.srOnly}>
                New username
              </label>
              <input
                id="profile-username"
                ref={usernameInputRef}
                type="text"
                className={styles.usernameInput}
                value={newUsername}
                onChange={(e) => setNewUsername(e.target.value)}
                disabled={isSaving}
              />
              <div className={styles.editActions}>
                <button
                  type="button"
                  className={styles.saveBtn}
                  onClick={saveUsername}
                  disabled={isSaving}
                >
                  {isSaving ? 'Saving…' : 'Save'}
                </button>
                <button
                  type="button"
                  className={styles.cancelBtn}
                  onClick={cancelEditUsername}
                  disabled={isSaving}
                >
                  Cancel
                </button>
              </div>
              {usernameError && (
                <p className={styles.fieldError} role="alert">
                  {usernameError}
                </p>
              )}
            </div>
          ) : (
            <div className={styles.usernameRow}>
              <span className={styles.displayUsername}>{user.username}</span>
              {!guest && (
                <button
                  type="button"
                  className={styles.editBtn}
                  onClick={startEditUsername}
                  aria-label="Edit username"
                >
                  Edit
                </button>
              )}
            </div>
          )}

          {guest && <span className={styles.guestTag}>Guest</span>}
        </div>

        {stats && (
          <div className={styles.statsGrid}>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.totalGames}</span>
              <span className={styles.statLabel}>Total Games</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.wins}</span>
              <span className={styles.statLabel}>Wins</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{stats.bestScore.toLocaleString()}</span>
              <span className={styles.statLabel}>Best Score</span>
            </div>
            <div className={styles.statCard}>
              <span className={styles.statValue}>{winRate}%</span>
              <span className={styles.statLabel}>Win Rate</span>
            </div>
          </div>
        )}

        {guest && (
          <div className={styles.upgradeSection}>
            <p className={styles.upgradePrompt}>
              Create an account to save your progress and appear on the leaderboard.
            </p>
            <form onSubmit={handleUpgrade} className={styles.upgradeForm} noValidate>
              <div className={styles.field}>
                <label htmlFor="upgrade-username" className={styles.label}>
                  Username
                </label>
                <input
                  id="upgrade-username"
                  type="text"
                  autoComplete="username"
                  className={styles.input}
                  value={upgradeUsername}
                  onChange={(e) => setUpgradeUsername(e.target.value)}
                  disabled={isUpgrading}
                  required
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="upgrade-password" className={styles.label}>
                  Password
                </label>
                <input
                  id="upgrade-password"
                  type="password"
                  autoComplete="new-password"
                  className={styles.input}
                  value={upgradePassword}
                  onChange={(e) => setUpgradePassword(e.target.value)}
                  disabled={isUpgrading}
                  required
                />
              </div>
              {upgradeError && (
                <p className={styles.fieldError} role="alert">
                  {upgradeError}
                </p>
              )}
              <button
                type="submit"
                className={styles.upgradeBtn}
                disabled={isUpgrading}
              >
                {isUpgrading ? 'Creating account…' : 'Create Account'}
              </button>
            </form>
          </div>
        )}

        <div className={styles.footer}>
          <button
            type="button"
            className={styles.logoutBtn}
            onClick={onLogout}
          >
            Log out
          </button>
        </div>
      </div>
    </div>
  );
});

export default ProfilePanel;
