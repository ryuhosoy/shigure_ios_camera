/** フレーム出力から JPEG 送信をトリガーする目標 fps */
export const TARGET_SEND_FPS = 20;

export const SEND_FRAME_MIN_INTERVAL_SEC = 1 / TARGET_SEND_FPS;

/** 撮影・エンコード解像度（サーバー負荷とのバランス） */
export const STREAM_CAPTURE_SIZE = { width: 640, height: 480 } as const;