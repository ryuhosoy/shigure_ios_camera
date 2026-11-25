import 'react-native-vision-camera-worklets';

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { useSharedValue } from 'react-native-reanimated';
import type { Frame } from 'react-native-vision-camera';
import { Camera, useFrameOutput } from 'react-native-vision-camera';
import { scheduleOnRN } from 'react-native-worklets';

import { encodeBgraToJpeg } from '../../modules/my-module/src/frameJpeg';
import { SEND_FRAME_MIN_INTERVAL_SEC, STREAM_CAPTURE_SIZE } from '@/lib/cameraStream';

import type { VisionCameraSenderProps } from './VisionCameraSender.types';

export type { VisionCameraSenderProps };

export function VisionCameraSender({
  active,
  onReady,
  onStopped,
  onError,
  onJpeg,
}: VisionCameraSenderProps) {
  const lastFrameTs = useSharedValue(0);
  const encodeBusy = useRef(false);
  const onJpegRef = useRef(onJpeg);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    onJpegRef.current = onJpeg;
    onErrorRef.current = onError;
  }, [onJpeg, onError]);

  const processFrameBuffer = useCallback(
    async (pixels: ArrayBuffer, width: number, height: number) => {
      if (!active || encodeBusy.current) return;
      encodeBusy.current = true;
      try {
        const jpeg = await encodeBgraToJpeg(pixels, width, height, 0.45);
        onJpegRef.current(jpeg);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        onErrorRef.current(`JPEG化失敗: ${msg}`);
      } finally {
        encodeBusy.current = false;
      }
    },
    [active],
  );

  const onFrame = useMemo(() => {
    const fn = (frame: Frame) => {
      'worklet';
      try {
        const t = frame.timestamp;
        const last = lastFrameTs.value;
        if (t - last < SEND_FRAME_MIN_INTERVAL_SEC) {
          return;
        }
        if (!frame.hasPixelBuffer) {
          return;
        }
        const width = frame.width;
        const height = frame.height;
        const copy = frame.getPixelBuffer().slice(0);
        lastFrameTs.value = t;
        scheduleOnRN(processFrameBuffer, copy, width, height);
      } finally {
        frame.dispose();
      }
    };
    return fn;
  }, [lastFrameTs, processFrameBuffer]);

  const frameOutput = useFrameOutput({
    targetResolution: STREAM_CAPTURE_SIZE,
    pixelFormat: 'rgb',
    enablePreviewSizedOutputBuffers: true,
    dropFramesWhileBusy: true,
    onFrame,
  });

  const constraints = useMemo(() => [{ fps: 30 }], []);

  return (
    <Camera
      style={StyleSheet.absoluteFill}
      device="back"
      isActive={active}
      outputs={[frameOutput]}
      constraints={constraints}
      onStarted={onReady}
      onStopped={onStopped}
      onError={(e) => onError(e.message)}
    />
  );
}