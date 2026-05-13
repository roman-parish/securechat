/**
 * SecureChat — End-to-End Encrypted Messaging
 * Copyright (c) 2026 Roman Parish
 * Licensed under the MIT License — see LICENSE file for details
 *
 * https://github.com/roman-parish/securechat
 */
import { createContext, useContext, useState, useEffect } from 'react';

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [theme, setTheme] = useState(() => {
    // Load from localStorage, default to dark
    return localStorage.getItem('theme') || 'dark';
  });

  useEffect(() => {
    const bg = theme === 'light' ? '#f5f5fa' : '#0f0f13';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.background = bg;
    document.body.style.background = bg;
    const metaTC = document.querySelector('meta[name="theme-color"]');
    if (metaTC) metaTC.setAttribute('content', bg);
    localStorage.setItem('theme', theme);
  }, [theme]);

  const toggleTheme = () => setTheme(t => t === 'dark' ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
