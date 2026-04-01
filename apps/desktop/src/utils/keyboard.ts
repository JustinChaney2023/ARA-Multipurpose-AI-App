import { useEffect, useCallback } from 'react';

type KeyboardHandler = (e: KeyboardEvent) => void;

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: KeyboardHandler;
  description: string;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]): void {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    if (e.target instanceof HTMLInputElement || 
        e.target instanceof HTMLTextAreaElement ||
        (e.target as HTMLElement).isContentEditable) {
      return;
    }

    for (const shortcut of shortcuts) {
      const keyMatch = e.key.toLowerCase() === shortcut.key.toLowerCase();
      const ctrlMatch = !!shortcut.ctrl === e.ctrlKey;
      const shiftMatch = !!shortcut.shift === e.shiftKey;
      const altMatch = !!shortcut.alt === e.altKey;

      if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
        e.preventDefault();
        shortcut.handler(e);
        break;
      }
    }
  }, [shortcuts]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
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
