import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  DEBUG_WS_PATH,
  DEFAULT_SETTINGS,
  INGEST_WS_PATH,
  saveSettings,
  useSettings,
  wsUrl,
} from '@/lib/settings';

export default function SettingsScreen() {
  const router = useRouter();
  const settings = useSettings();
  const [host, setHost] = useState(settings.host);
  const [port, setPort] = useState(String(settings.port));

  useEffect(() => {
    setHost(settings.host);
    setPort(String(settings.port));
  }, [settings]);

  const portNum = Number(port);
  const valid = host.trim().length > 0 && Number.isInteger(portNum) && portNum > 0 && portNum < 65536;
  const preview = { host: host.trim(), port: portNum };

  const onSave = async () => {
    if (!valid) return;
    await saveSettings(preview);
    router.back();
  };

  return (
    <View style={styles.root}>
      <Text style={styles.label}>ホスト</Text>
      <TextInput
        style={styles.input}
        value={host}
        onChangeText={setHost}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        placeholder={DEFAULT_SETTINGS.host}
      />
      <Text style={styles.label}>ポート</Text>
      <TextInput
        style={styles.input}
        value={port}
        onChangeText={setPort}
        keyboardType="number-pad"
        placeholder={String(DEFAULT_SETTINGS.port)}
      />

      {valid && (
        <View style={styles.preview}>
          <Text style={styles.previewText}>上り: {wsUrl(preview, INGEST_WS_PATH)}</Text>
          <Text style={styles.previewText}>下り: {wsUrl(preview, DEBUG_WS_PATH)}</Text>
        </View>
      )}

      <Pressable
        onPress={onSave}
        disabled={!valid}
        style={({ pressed }) => [styles.save, !valid && styles.disabled, pressed && { opacity: 0.7 }]}>
        <Text style={styles.saveText}>保存</Text>
      </Pressable>
      <Pressable
        onPress={() => {
          setHost(DEFAULT_SETTINGS.host);
          setPort(String(DEFAULT_SETTINGS.port));
        }}
        style={styles.reset}>
        <Text style={styles.resetText}>既定値に戻す</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 20, backgroundColor: '#f2f2f7' },
  label: { fontSize: 14, color: '#555', marginTop: 16, marginBottom: 6 },
  input: {
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 17,
    color: '#000',
  },
  preview: { marginTop: 16, gap: 4 },
  previewText: { fontSize: 12, color: '#666', fontFamily: 'Menlo' },
  save: {
    marginTop: 28,
    backgroundColor: '#007aff',
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: 'center',
  },
  disabled: { backgroundColor: '#9bbcf0' },
  saveText: { color: '#fff', fontSize: 17, fontWeight: '600' },
  reset: { marginTop: 14, alignItems: 'center' },
  resetText: { color: '#007aff', fontSize: 15 },
});
