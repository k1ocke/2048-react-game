/** Returns the first two characters of a username, uppercased. Falls back to '?' for empty input. */
export const getInitials = (username: string): string => {
  const trimmed = username.trim();
  if (!trimmed) return '?';
  return trimmed.slice(0, 2).toUpperCase();
};
