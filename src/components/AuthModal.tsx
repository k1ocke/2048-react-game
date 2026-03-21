import { memo, useEffect, useRef, useState } from 'react';
import { useFocusTrap } from '../utils/useFocusTrap';
import styles from './AuthModal.module.css';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLogin: (username: string, password: string) => Promise<void>;
  onRegister: (username: string, password: string) => Promise<void>;
  onLoginAsGuest: () => Promise<void>;
}

type Tab = 'login' | 'register';

const AuthModal = memo(({ isOpen, onClose, onLogin, onRegister, onLoginAsGuest }: AuthModalProps) => {
  const [activeTab, setActiveTab] = useState<Tab>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const firstInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useFocusTrap(dialogRef, isOpen);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      setUsername('');
      setPassword('');
      setIsSubmitting(false);
      // Focus first input after mount
      setTimeout(() => firstInputRef.current?.focus(), 50);
    }
  }, [isOpen, activeTab]);

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    setError(null);
    setUsername('');
    setPassword('');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);
    try {
      if (activeTab === 'login') {
        await onLogin(username, password);
      } else {
        await onRegister(username, password);
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGuestLogin = async () => {
    setError(null);
    setIsSubmitting(true);
    try {
      await onLoginAsGuest();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className={styles.backdrop}
      role="dialog"
      aria-modal="true"
      aria-label={activeTab === 'login' ? 'Login' : 'Register'}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={styles.modal} ref={dialogRef}>
        <div className={styles.header}>
          <div className={styles.tabs} role="tablist">
            <button
              role="tab"
              aria-selected={activeTab === 'login'}
              className={`${styles.tab} ${activeTab === 'login' ? styles.tabActive : ''}`}
              onClick={() => handleTabChange('login')}
              type="button"
            >
              Login
            </button>
            <button
              role="tab"
              aria-selected={activeTab === 'register'}
              className={`${styles.tab} ${activeTab === 'register' ? styles.tabActive : ''}`}
              onClick={() => handleTabChange('register')}
              type="button"
            >
              Register
            </button>
          </div>
          <button
            className={styles.closeBtn}
            onClick={onClose}
            aria-label="Close"
            type="button"
          >
            ✕
          </button>
        </div>

        <form onSubmit={handleSubmit} className={styles.form} noValidate>
          <div className={styles.field}>
            <label htmlFor="auth-username" className={styles.label}>
              Username
            </label>
            <input
              id="auth-username"
              ref={firstInputRef}
              type="text"
              autoComplete="username"
              className={styles.input}
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          <div className={styles.field}>
            <label htmlFor="auth-password" className={styles.label}>
              Password
            </label>
            <input
              id="auth-password"
              type="password"
              autoComplete={activeTab === 'login' ? 'current-password' : 'new-password'}
              className={styles.input}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={isSubmitting}
              required
            />
          </div>

          {error && (
            <p className={styles.error} role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            className={styles.submitBtn}
            disabled={isSubmitting}
          >
            {isSubmitting
              ? activeTab === 'login' ? 'Logging in…' : 'Registering…'
              : activeTab === 'login' ? 'Login' : 'Register'}
          </button>

          {activeTab === 'login' && (
            <div className={styles.guestRow}>
              <button
                type="button"
                className={styles.guestLink}
                onClick={handleGuestLogin}
                disabled={isSubmitting}
              >
                Continue as Guest
              </button>
            </div>
          )}
        </form>
      </div>
    </div>
  );
});

export default AuthModal;
