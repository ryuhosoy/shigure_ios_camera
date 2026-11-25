import type { VisionCameraSenderProps } from './VisionCameraSender.types';

export type { VisionCameraSenderProps };

/** Web / SSR 用スタブ。iOS/Android は `VisionCameraSender.native.tsx` が使われる */
export function VisionCameraSender(_props: VisionCameraSenderProps) {
  return null;
}