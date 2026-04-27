import { useState, useEffect } from 'react';

import { getTheme, setTheme, type Theme } from '../utils/theme';

import { Icon } from './Icon';
import { Tooltip } from './Tooltip';

export function ThemeToggle() {
  const [theme, setCurrentTheme] = useState<Theme>('system');
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    setCurrentTheme(getTheme());
  }, []);

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
    setCurrentTheme(newTheme);
    setIsOpen(false);
  };

  const icons: Record<Theme, { label: string; iconName: 'sun' | 'moon' | 'monitor' }> = {
    light: { label: 'Light', iconName: 'sun' },
    dark: { label: 'Dark', iconName: 'moon' },
    system: { label: 'System', iconName: 'monitor' },
  };

  return (
    <div style={{ position: 'relative' }}>
      <Tooltip content={`Theme: ${theme}`}>
        <button
          onClick={() => setIsOpen(!isOpen)}
          style={{
            background: 'none',
            border: '1px solid var(--color-border)',
            borderRadius: '6px',
            padding: '0.5rem',
            cursor: 'pointer',
            fontSize: '1rem',
          }}
        >
          <Icon name={icons[theme].iconName} size={18} />
        </button>
      </Tooltip>

      {isOpen && (
        <>
          <div
            style={{
              position: 'fixed',
              inset: 0,
            }}
            onClick={() => setIsOpen(false)}
          />
          <div
            style={{
              position: 'absolute',
              top: '100%',
              right: 0,
              marginTop: '0.5rem',
              background: 'white',
              border: '1px solid var(--color-border)',
              borderRadius: '8px',
              boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
              zIndex: 100,
              minWidth: '150px',
            }}
          >
            {(['light', 'dark', 'system'] as Theme[]).map(t => (
              <button
                key={t}
                onClick={() => handleThemeChange(t)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  width: '100%',
                  padding: '0.75rem 1rem',
                  border: 'none',
                  background: theme === t ? '#f0f9ff' : 'transparent',
                  color: theme === t ? '#0369a1' : 'inherit',
                  cursor: 'pointer',
                  textAlign: 'left',
                  borderRadius: '8px',
                }}
              >
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Icon name={icons[t].iconName} size={16} /> {icons[t].label}
                </span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
