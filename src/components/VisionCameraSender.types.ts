export type VisionCameraSenderProps = {
  active: boolean;
  onReady: () => void;
  onStopped: () => void;
  onError: (message: string) => void;
  onJpeg: (data: ArrayBuffer) => void;
};