export type LightCurvePlotOptions = {
  xMode?: "index" | "time";
  yScaleMode?: "robust" | "minmax";
  yQuantiles?: { lo: number; hi: number };
  yPadFrac?: number;
  manualYRange?: { lo: number; hi: number };
  showUnityBaseline?: boolean;
  showMeanLine?: boolean;
  title?: string;
  trackingMode?: "fixed" | "dynamic" | "live";
  dynamicWindowSec?: number;
  dynamicWindowSamples?: number;
};

export type ResolvedLightCurvePlotOptions = Omit<Required<LightCurvePlotOptions>, "manualYRange"> & {
  manualYRange?: { lo: number; hi: number };
};

export type LightCurveSample = {
  t?: number;
  flux: number;
};

export type LightCurveOverlayPoint = {
  t: number;
  flux: number;
};

export type LightCurveOverlaySeries = {
  id: string;
  label: string;
  color: string;
  samples: LightCurveOverlayPoint[];
  style?: "solid" | "dashed" | "dotted";
  width?: number;
  alpha?: number;
  includeInLegend?: boolean;
  includeInRange?: boolean;
};

export type LightCurveMarker = {
  id: string;
  tSec: number;
  label: string;
  color?: string;
  kind?: "event" | "timing" | "compare" | "contact";
  emphasized?: boolean;
  align?: "top" | "bottom";
};

export type LightCurveWindowOverlay = {
  id: string;
  startSec: number;
  endSec: number;
  color: string;
  alpha?: number;
  label?: string;
};

export type LightCurveBadge = {
  label: string;
  color: string;
};

export type LightCurveInsetSeries = {
  label: string;
  color: string;
  samples: LightCurveOverlayPoint[];
};

export type LightCurveComparisonInset = {
  title: string;
  series: LightCurveInsetSeries[];
};

export type LightCurveHistoryState = {
  capacity: number;
  flux: number[];
  t: number[];
  startIndex: number;
  finiteTimeCount: number;
  earliestFiniteTime: number;
  earliestFiniteTimeIndex: number;
  latestFiniteTime: number;
  latestFiniteTimeIndex: number;
};
