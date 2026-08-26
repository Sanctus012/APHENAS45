
import React, { createContext, useContext, useEffect, useState, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
 
const STORAGE_KEY = 'aphenas.preferences.v1';
 
const FONT_SCALE_STEPS = [0.9, 1, 1.1, 1.2, 1.35];
const DEFAULT_PREFERENCES = {
  fontScaleIndex: 1, // index into FONT_SCALE_STEPS, default = 1.0x
  themeMode: 'light', // 'light' | 'dark'
  enterToSend: false,
};
 
const PreferencesContext = createContext({
  ...DEFAULT_PREFERENCES,
  fontScale: 1,
  loaded: false,
  setFontScaleIndex: () => {},
  increaseFontSize: () => {},
  decreaseFontSize: () => {},
  setThemeMode: () => {},
  toggleTheme: () => {},
  setEnterToSend: () => {},
});
 
export function PreferencesProvider({ children }) {
  const [preferences, setPreferences] = useState(DEFAULT_PREFERENCES);
  const [loaded, setLoaded] = useState(false);
 
  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setPreferences((prev) => ({ ...prev, ...parsed }));
        }
      } catch (error) {
        // If preferences fail to load, silently fall back to defaults.
      } finally {
        setLoaded(true);
      }
    })();
  }, []);
 
  const persist = useCallback(async (next) => {
    setPreferences(next);
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (error) {
      // Non-fatal: preference change still applies for this session.
    }
  }, []);
 
  const setFontScaleIndex = useCallback((indexOrUpdater) => {
    setPreferences((prev) => {
      const rawIndex = typeof indexOrUpdater === 'function' ? indexOrUpdater(prev.fontScaleIndex) : indexOrUpdater;
      const clamped = Math.max(0, Math.min(FONT_SCALE_STEPS.length - 1, rawIndex));
      const next = { ...prev, fontScaleIndex: clamped };
      persist(next);
      return next;
    });
  }, [persist]);
 
  const increaseFontSize = useCallback(() => setFontScaleIndex((i) => i + 1), [setFontScaleIndex]);
  const decreaseFontSize = useCallback(() => setFontScaleIndex((i) => i - 1), [setFontScaleIndex]);
 
  const setThemeMode = useCallback((mode) => {
    const next = { ...preferences, themeMode: mode === 'dark' ? 'dark' : 'light' };
    persist(next);
  }, [preferences, persist]);
 
  const toggleTheme = useCallback(() => {
    setThemeMode(preferences.themeMode === 'dark' ? 'light' : 'dark');
  }, [preferences.themeMode, setThemeMode]);
 
  const setEnterToSend = useCallback((value) => {
    const next = { ...preferences, enterToSend: !!value };
    persist(next);
  }, [preferences, persist]);
 
  const value = useMemo(() => ({
    ...preferences,
    fontScale: FONT_SCALE_STEPS[preferences.fontScaleIndex] ?? 1,
    fontScaleSteps: FONT_SCALE_STEPS,
    loaded,
    setFontScaleIndex,
    increaseFontSize,
    decreaseFontSize,
    setThemeMode,
    toggleTheme,
    setEnterToSend,
  }), [preferences, loaded, setFontScaleIndex, increaseFontSize, decreaseFontSize, setThemeMode, toggleTheme, setEnterToSend]);
 
  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}
 
export function usePreferences() {
  return useContext(PreferencesContext);
}
 
export { FONT_SCALE_STEPS };
 
