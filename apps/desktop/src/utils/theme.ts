const THEME_KEY = 'ara_theme';

export type Theme = 'light' | 'dark' | 'system';

export function getTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY) as Theme;
    return stored || 'system';
  } catch {
    return 'system';
  }
}

export function setTheme(theme: Theme): void {
  try {
    localStorage.setItem(THEME_KEY, theme);
    applyTheme(theme);
  } catch {
    // Ignore storage errors
  }
}

export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  
  if (theme === 'dark' || (theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    root.classList.add('dark');
  } else {
    root.classList.remove('dark');
  }
}

export function initTheme(): void {
  const theme = getTheme();
  applyTheme(theme);
  
  // Listen for system theme changes
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getTheme() === 'system') {
      applyTheme('system');
    }
  });
}
