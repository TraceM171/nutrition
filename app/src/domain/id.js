export function genId() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID)
    return crypto.randomUUID().replace(/-/g, '');
  // Fallback for environments without crypto.randomUUID
  return Date.now().toString(36) + Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2);
}
