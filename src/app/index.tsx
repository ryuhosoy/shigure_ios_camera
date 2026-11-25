import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import { useCameraPermission } from 'react-native-vision-camera';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { VisionCameraSender } from '@/components/VisionCameraSender';
import { arrayBufferToBase64 } from '@/lib/base64';
import { DEBUG_WS_PATH, INGEST_WS_PATH, useSettings, wsUrl } from '@/lib/settings';

const RECONNECT_MS = 2000;
const RECV_STALE_MS = 2000;
const ERROR_SHOW_MS = 4000;
const NATIVE_CAMERA = Platform.OS === 'ios' || Platform.OS === 'android';

export default function MainScreen() {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const { hasPermission, requestPermission } = useCameraPermission();

  const [sending, setSending] = useState(false);
  const [cameraAllowed, setCameraAllowed] = useState(hasPermission);
  const [cameraReady, setCameraReady] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [upOpen, setUpOpen] = useState(false);
  const [downOpen, setDownOpen] = useState(false);
  const [error, setError] = useState<{ msg: string; at: number } | null>(null);
  const [, setTick] = useState(0);

  const lastRecvAt = useRef(0);
  const lastSentAt = useRef(0);
  const sentCount = useRef(0);
  const ingestWsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (hasPermission) setCameraAllowed(true);
  }, [hasPermission]);

  const reportError = (msg: string) => setError({ msg, at: Date.now() });

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 500);
    return () => clearInterval(id);
  }, []);

  // ---- 下り: デバッグJPEG受信 ----
  useEffect(() => {
    let closed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      ws = new WebSocket(wsUrl(settings, DEBUG_WS_PATH));
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => setDownOpen(true);
      ws.onmessage = (ev) => {
        let b64: string | null = null;
        if (typeof ev.data === 'string') {
          try {
            const msg = JSON.parse(ev.data);
            if (typeof msg.image_base64 === 'string') b64 = msg.image_base64;
          } catch {
            // JSON以外のテキストは無視
          }
        } else if (ev.data instanceof ArrayBuffer) {
          b64 = arrayBufferToBase64(ev.data);
        }
        if (b64) {
          lastRecvAt.current = Date.now();
          setImageUri(`data:image/jpeg;base64,${b64}`);
        }
      };
      ws.onerror = () => reportError(`受信接続失敗 (${settings.host}:${settings.port})`);
      ws.onclose = () => {
        setDownOpen(false);
        if (!closed) timer = setTimeout(connect, RECONNECT_MS);
      };
    };
    connect();
    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
      setDownOpen(false);
    };
  }, [settings]);

  // ---- 上り: WebSocket（JPEG は VisionCameraSender から） ----
  useEffect(() => {
    if (!sending) {
      ingestWsRef.current?.close();
      ingestWsRef.current = null;
      setUpOpen(false);
      return;
    }
    let closed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      ws = new WebSocket(wsUrl(settings, INGEST_WS_PATH));
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => {
        ingestWsRef.current = ws;
        setUpOpen(true);
      };
      ws.onerror = () => reportError(`送信接続失敗 (${settings.host}:${settings.port})`);
      ws.onclose = () => {
        ingestWsRef.current = null;
        setUpOpen(false);
        if (!closed) timer = setTimeout(connect, RECONNECT_MS);
      };
    };
    connect();

    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
      ingestWsRef.current = null;
      setUpOpen(false);
    };
  }, [sending, settings]);

  const onJpegFromCamera = useCallback((data: ArrayBuffer) => {
    const ws = ingestWsRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    ws.send(data);
    lastSentAt.current = Date.now();
    sentCount.current += 1;
  }, []);

  const toggleSending = async () => {
    if (sending) {
      setSending(false);
      setCameraReady(false);
      return;
    }
    if (!hasPermission && !cameraAllowed) {
      const ok = await requestPermission();
      if (!ok) {
        reportError('カメラへのアクセスが許可されていません');
        return;
      }
      setCameraAllowed(true);
    }
    if (!NATIVE_CAMERA) {
      reportError('ネイティブ開発ビルドが必要です（Expo Go では Vision Camera 不可）');
      return;
    }
    setCameraReady(false);
    setSending(true);
  };

  const now = Date.now();
  let status: string;
  if (error && now - error.at < ERROR_SHOW_MS) {
    status = `エラー: ${error.msg}`;
  } else if (!sending && !downOpen) {
    status = '未接続';
  } else {
    let up: string;
    if (!sending) {
      up = '送信OFF';
    } else if (!cameraAllowed) {
      up = 'カメラ未許可';
    } else if (!NATIVE_CAMERA) {
      up = '要開発ビルド';
    } else if (!cameraReady) {
      up = 'カメラ起動中…';
    } else if (!upOpen) {
      up = '送信WS接続中…';
    } else if (now - lastSentAt.current < 3000) {
      up = `フレーム送信中 (${sentCount.current})`;
    } else {
      up = '送信WS接続済・フレーム未送信';
    }
    const down = !downOpen
      ? '受信未接続'
      : now - lastRecvAt.current < RECV_STALE_MS
        ? 'デバッグ受信中'
        : '画像待ち';
    status = `${up} · ${down}`;
  }
  const isError = status.startsWith('エラー');

  const cameraActive = sending && cameraAllowed && NATIVE_CAMERA;

  return (
    <View style={styles.root}>
      {cameraActive && (
        <VisionCameraSender
          active={cameraActive}
          onReady={() => setCameraReady(true)}
          onStopped={() => setCameraReady(false)}
          onError={(msg: string) => reportError(msg)}
          onJpeg={onJpegFromCamera}
        />
      )}

      <View style={[StyleSheet.absoluteFill, styles.cover]}>
        {imageUri ? (
          <Image
            source={{ uri: imageUri }}
            style={StyleSheet.absoluteFill}
            contentFit="contain"
            transition={0}
            cachePolicy="none"
          />
        ) : (
          <Text style={styles.waiting}>デバッグ画像待ち…</Text>
        )}
      </View>

      <View style={[styles.statusBar, { paddingTop: insets.top + 6 }]}>
        <Text style={[styles.statusText, isError && styles.errorText]} numberOfLines={1}>
          {status}
        </Text>
      </View>

      <View style={[styles.bottomBar, { paddingBottom: insets.bottom + 12 }]}>
        <Pressable
          onPress={toggleSending}
          style={({ pressed }) => [styles.button, sending && styles.buttonOn, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>{sending ? '送信 ON' : '送信 OFF'}</Text>
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings')}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}>
          <Text style={styles.buttonText}>設定</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  cover: { backgroundColor: '#000', alignItems: 'center', justifyContent: 'center' },
  waiting: { color: '#aaa', fontSize: 18 },
  statusBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  statusText: { color: '#fff', fontSize: 14, textAlign: 'center' },
  errorText: { color: '#ff6b6b' },
  bottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-evenly',
    paddingTop: 12,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  button: {
    minWidth: 130,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: 'center',
    backgroundColor: '#333',
  },
  buttonOn: { backgroundColor: '#1f8a4c' },
  pressed: { opacity: 0.7 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});