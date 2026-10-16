export type ModelProbeSnapshot = {
  contexts: {
    id: number;
    renderer: string;
    lost: boolean;
    connected: boolean;
    frames: number;
    draws: number;
    pixels: number;
    resources: Record<
      string,
      { created: number; deleted: number; live: number }
    >;
  }[];
};
export type ModelFrameSample = {
  durationMs: number;
  frames: number;
  intervalP50Ms: number | null;
  intervalP95Ms: number | null;
};
declare global {
  interface Window {
    __gemu3dProbe: {
      snapshot: () => ModelProbeSnapshot;
      startSample: () => void;
      stopSample: () => ModelFrameSample | null;
    };
  }
}
