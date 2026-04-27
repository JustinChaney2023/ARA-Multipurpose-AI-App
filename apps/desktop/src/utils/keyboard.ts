/**
 * Keyboard shortcut utilities.
 *
 * useKeyboardShortcuts has been moved to hooks/useKeyboardShortcuts.ts.
 * This file keeps the shortcut catalog and formatting helpers used by
 * ShortcutsHelp.tsx.
 */

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler?: (e: KeyboardEvent) => void;
  description?: string;
}

export function formatShortcut(shortcut: Omit<ShortcutConfig, 'handler' | 'description'>): string {
  const parts: string[] = [];
  if (shortcut.ctrl) parts.push('Ctrl');
  if (shortcut.alt) parts.push('Alt');
  if (shortcut.shift) parts.push('Shift');
  parts.push(shortcut.key.toUpperCase());
  return parts.join('+');
}

export const COMMON_SHORTCUTS = {
  save: { key: 's', ctrl: true, description: 'Save draft' },
  export: { key: 'e', ctrl: true, description: 'Export PDF' },
  print: { key: 'p', ctrl: true, description: 'Print form' },
  new: { key: 'n', ctrl: true, description: 'New form' },
  help: { key: '?', description: 'Show shortcuts' },
  focusSearch: { key: 'k', ctrl: true, description: 'Focus search' },
  escape: { key: 'Escape', description: 'Close modal/cancel' },
} as const;
