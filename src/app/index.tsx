import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image } from 'expo-image';
import { useKeepAwake } from 'expo-keep-awake';
import { useRouter } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { arrayBufferToBase64, base64ToArrayBuffer } from '@/lib/base64';
import { DEBUG_WS_PATH, INGEST_WS_PATH, useSettings, wsUrl } from '@/lib/settings';
const RECONNECT_MS = 2000;
const MIN_SEND_INTERVAL_MS = 100; // 最大 ~10fps
const RECV_STALE_MS = 2000; // これ以上下りが来なければ「画像待ち」
const ERROR_SHOW_MS = 4000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export default function MainScreen() {
  useKeepAwake();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const settings = useSettings();
  const [permission, requestPermission] = useCameraPermissions();

  const [sending, setSending] = useState(false);
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [upOpen, setUpOpen] = useState(false);
  const [downOpen, setDownOpen] = useState(false);
  const [error, setError] = useState<{ msg: string; at: number } | null>(null);
  const [, setTick] = useState(0);

  const cameraRef = useRef<CameraView>(null);
  const cameraReady = useRef(false);
  const lastRecvAt = useRef(0);
  const [pictureSize, setPictureSize] = useState<string | undefined>(undefined);

  const reportError = (msg: string) => setError({ msg, at: Date.now() });

  // ステータス更新用のタイマー
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

  // ---- 上り: カメラJPEG送信 ----
  useEffect(() => {
    if (!sending) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      ws = new WebSocket(wsUrl(settings, INGEST_WS_PATH));
      ws.binaryType = 'arraybuffer';
      ws.onopen = () => setUpOpen(true);
      ws.onerror = () => reportError(`送信接続失敗 (${settings.host}:${settings.port})`);
      ws.onclose = () => {
        setUpOpen(false);
        if (!closed) timer = setTimeout(connect, RECONNECT_MS);
      };
    };
    connect();

    const loop = async () => {
      while (!closed) {
        const cam = cameraRef.current;
        if (!cam || !cameraReady.current || !ws || ws.readyState !== WebSocket.OPEN) {
          await sleep(100);
          continue;
        }
        const t0 = Date.now();
        try {
          const pic = await cam.takePictureAsync({
            base64: true,
            quality: 0.5,
            exif: false,
            shutterSound: false,
          });
          if (!closed && pic?.base64 && ws.readyState === WebSocket.OPEN) {
            ws.send(base64ToArrayBuffer(pic.base64));
          }
        } catch (e: any) {
          reportError(`撮影失敗: ${e?.message ?? e}`);
          await sleep(500);
        }
        const wait = MIN_SEND_INTERVAL_MS - (Date.now() - t0);
        if (wait > 0) await sleep(wait);
      }
    };
    loop();

    return () => {
      closed = true;
      clearTimeout(timer);
      ws?.close();
      setUpOpen(false);
    };
  }, [sending, settings]);

  const toggleSending = async () => {
    if (sending) {
      setSending(false);
      cameraReady.current = false;
      return;
    }
    if (!permission?.granted) {
      const res = await requestPermission();
      if (!res.granted) {
        reportError('カメラへのアクセスが許可されていません');
        return;
      }
    }
    setSending(true);
  };

  const onCameraReady = async () => {
    cameraReady.current = true;
    if (pictureSize) return;
    try {
      const sizes = await cameraRef.current?.getAvailablePictureSizesAsync();
      const preferred = ['1280x720', '640x480', 'Medium'].find((s) => sizes?.includes(s));
      if (preferred) setPictureSize(preferred);
    } catch {}
  };

  // ---- ステータス文言 ----
  const now = Date.now();
  let status: string;
  if (error && now - error.at < ERROR_SHOW_MS) {
    status = `エラー: ${error.msg}`;
  } else if (!sending && !downOpen) {
    status = '未接続';
  } else {
    const up = sending ? (upOpen ? '送信中' : '送信接続中…') : '送信OFF';
    const down = !downOpen
      ? '受信未接続'
      : now - lastRecvAt.current < RECV_STALE_MS
        ? 'デバッグ受信中'
        : '画像待ち';
    status = `${up} · ${down}`;
  }
  const isError = status.startsWith('エラー');

  return (
    <View style={styles.root}>
      {/* カメラは撮影のためだけにマウント。サーバ画像/黒背景の下に隠す */}
      {sending && permission?.granted && (
        <CameraView
          ref={cameraRef}
          style={StyleSheet.absoluteFill}
          facing="back"
          animateShutter={false}
          pictureSize={pictureSize}
          onCameraReady={onCameraReady}
          onMountError={(e) => reportError(`カメラ起動失敗: ${e.message}`)}
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
