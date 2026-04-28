import { useEffect, useRef } from 'react';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  shift?: boolean;
  alt?: boolean;
  handler: () => void;
  preventDefault?: boolean;
}

export function useKeyboardShortcuts(shortcuts: ShortcutConfig[]) {
  // Store shortcuts in a ref so the event listener never needs to re-register
  // just because the caller passed a new array identity on re-render.
  const shortcutsRef = useRef(shortcuts);
  shortcutsRef.current = shortcuts;

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts when typing in inputs, selects, or content-editables
      const target = e.target as HTMLElement;
      if (
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        target instanceof HTMLSelectElement ||
        target.isContentEditable
      ) {
        return;
      }

      for (const shortcut of shortcutsRef.current) {
        const keyMatch =
          e.key.toLowerCase() === shortcut.key.toLowerCase() || e.key === shortcut.key;
        const ctrlMatch = !!shortcut.ctrl === e.ctrlKey;
        const shiftMatch = !!shortcut.shift === e.shiftKey;
        const altMatch = !!shortcut.alt === e.altKey;

        if (keyMatch && ctrlMatch && shiftMatch && altMatch) {
          if (shortcut.preventDefault !== false) {
            e.preventDefault();
          }
          shortcut.handler();
          break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []); // registered once; shortcutsRef always holds the latest array
}

// Common shortcuts
export const SHORTCUTS = {
  undo: { key: 'z', ctrl: true, description: 'Undo' },
  redo: { key: 'y', ctrl: true, description: 'Redo' },
  new: { key: 'n', ctrl: true, description: 'New form' },
  export: { key: 'e', ctrl: true, description: 'Export PDF' },
  preview: { key: 'p', ctrl: true, description: 'Preview PDF' },
  back: { key: 'Escape', description: 'Go back' },
} as const;
