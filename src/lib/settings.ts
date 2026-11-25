import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';

export type ServerSettings = { host: string; port: number };

export const DEFAULT_SETTINGS: ServerSettings = { host: '10.40.1.129', port: 8767 };

export const INGEST_WS_PATH = '/ws/iphone/frame';
export const DEBUG_WS_PATH = '/ws/tracking_debug';
const KEY = 'serverSettings';

let current: ServerSettings = DEFAULT_SETTINGS;
let loaded = false;
const listeners = new Set<(s: ServerSettings) => void>();

async function load() {
  if (loaded) return;
  loaded = true;
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) current = { ...DEFAULT_SETTINGS, ...JSON.parse(raw) };
  } catch {}
  listeners.forEach((l) => l(current));
}

export async function saveSettings(s: ServerSettings) {
  current = s;
  listeners.forEach((l) => l(current));
  await AsyncStorage.setItem(KEY, JSON.stringify(s));
}

export function useSettings(): ServerSettings {
  const [s, setS] = useState(current);
  useEffect(() => {
    listeners.add(setS);
    load();
    setS(current);
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

export const wsUrl = (s: ServerSettings, path: string) => `ws://${s.host}:${s.port}${path}`;
