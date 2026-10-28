import * as React from 'react';

interface ThemeContextValue {
  isDark: boolean;
  toggleTheme: () => void;
  setTheme: (theme: 'dark' | 'light') => void;
}

const ThemeContext = React.createContext<ThemeContextValue | null>(null);

function initialTheme(): boolean {
  const stored = localStorage.getItem('sigap-theme');
  if (stored === 'light') return false;
  if (stored === 'dark') return true;
  return true;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [isDark, setIsDark] = React.useState<boolean>(initialTheme);

  React.useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle('dark', isDark);
    root.style.colorScheme = isDark ? 'dark' : 'light';
    localStorage.setItem('sigap-theme', isDark ? 'dark' : 'light');
  }, [isDark]);

  const value = React.useMemo<ThemeContextValue>(
    () => ({
      isDark,
      toggleTheme: () => setIsDark((current) => !current),
      setTheme: (theme) => setIsDark(theme === 'dark')
    }),
    [isDark]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error('useTheme harus dipakai di dalam ThemeProvider.');
  return context;
}
