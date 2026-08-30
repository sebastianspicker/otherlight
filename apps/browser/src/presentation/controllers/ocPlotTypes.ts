/** Shared O-C plot contracts for controller logic and canvas rendering. */
export type OcBody = "planet" | "moon";
export type OcUnit = "s" | "ms";
export type OcTrendMode = "raw" | "fit" | "detrended";
export type OcCsvOptions = { unit?: OcUnit; trendMode?: OcTrendMode };
