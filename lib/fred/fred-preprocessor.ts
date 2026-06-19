/**
 * fred-preprocessor.ts
 *
 * Pre-processing layer for FRED time series data.
 *
 * Compute deterministic statistics (mean, peaks, troughs, trend) in code,
 * then pass results alongside raw data to Claude. This keeps numeric facts
 * precise and lets the model focus on interpretation.
 *
 * Integration: in fred-agent.ts, wrap getSeriesData results through
 * buildEnhancedToolResult() before returning to the agent loop.
 */

export interface FredObservation {
  date: string;  // "YYYY-MM-DD"
  value: number;
}

export interface SeriesStats {
  mean: number;
  min: { value: number; date: string };
  max: { value: number; date: string };
  latest: { value: number; date: string };
  trendDirection: "increasing" | "decreasing" | "flat";
  trendSlope: number;
  observationCount: number;
}

export interface InflectionPoint {
  date: string;
  value: number;
  type: "local_max" | "local_min";
}

/**
 * Compute summary statistics for a FRED time series.
 *
 * Trend: simple linear approximation over the last `trendWindow` observations.
 * The model needs to know "increasing" or "decreasing", not an OLS coefficient.
 *
 * flatThreshold: 0.05 is calibrated for percentage-point series (unemployment,
 * interest rates). Adjust for different units (e.g., 0.5 for basis-point series).
 */
export function computeStats(
  observations: FredObservation[],
  trendWindow = 12,
  flatThreshold = 0.05
): SeriesStats {
  if (observations.length === 0) {
    throw new Error("computeStats: observations array is empty");
  }

  const values = observations.map((o) => o.value);
  const dates = observations.map((o) => o.date);

  const mean = values.reduce((a, b) => a + b, 0) / values.length;

  const minValue = Math.min(...values);
  const minIndex = values.indexOf(minValue);

  const maxValue = Math.max(...values);
  const maxIndex = values.indexOf(maxValue);

  const window = Math.min(trendWindow, values.length);
  const recent = values.slice(-window);
  const slope = (recent[recent.length - 1] - recent[0]) / window;

  const trendDirection: "increasing" | "decreasing" | "flat" =
    slope > flatThreshold ? "increasing" : slope < -flatThreshold ? "decreasing" : "flat";

  return {
    mean: parseFloat(mean.toFixed(3)),
    min: { value: minValue, date: dates[minIndex] },
    max: { value: maxValue, date: dates[maxIndex] },
    latest: {
      value: values[values.length - 1],
      date: dates[dates.length - 1],
    },
    trendDirection,
    trendSlope: parseFloat(slope.toFixed(4)),
    observationCount: observations.length,
  };
}

/**
 * Find local maxima and minima via sign-change detection.
 *
 * For each observation i (excluding first and last), compute the difference
 * to the previous and next observations. If the sign changes from positive
 * to negative, it's a local max; negative to positive is a local min.
 *
 * minMagnitude filters noise — 0.1% is not meaningful for macro series.
 */
export function findInflectionPoints(
  observations: FredObservation[],
  minMagnitude = 0.1
): InflectionPoint[] {
  const points: InflectionPoint[] = [];
  const values = observations.map((o) => o.value);

  if (values.length < 3) return points;

  for (let i = 1; i < values.length - 1; i++) {
    const prevDiff = values[i] - values[i - 1];
    const nextDiff = values[i + 1] - values[i];

    if (prevDiff > 0 && nextDiff < 0 && Math.abs(values[i]) >= minMagnitude) {
      points.push({ date: observations[i].date, value: values[i], type: "local_max" });
    }
    if (prevDiff < 0 && nextDiff > 0 && Math.abs(values[i]) >= minMagnitude) {
      points.push({ date: observations[i].date, value: values[i], type: "local_min" });
    }
  }

  return points;
}

/**
 * Format a FRED series, its stats, and inflection points into a structured
 * XML block suitable for inclusion in Claude's context.
 *
 * Design:
 * - XML tags: clear section boundaries that Claude parses well
 * - Summary + raw data: summary orients model, raw data lets it reason about
 *   specific sub-periods if needed
 * - Raw data capped at 120 observations: beyond that, context cost > benefit
 * - Top 5 inflection points: most significant turning points, not noise
 */
export function buildSeriesContextBlock(
  seriesId: string,
  title: string,
  observations: FredObservation[],
  stats: SeriesStats,
  inflectionPoints: InflectionPoint[]
): string {
  const inflectionSummary = inflectionPoints
    .slice(0, 5)
    .map(p => `  - ${p.date}: ${p.value} (${p.type === "local_max" ? "peak" : "trough"})`)
    .join("\n");

  const recentObs = observations.slice(-120);
  const rawDataStr = recentObs
    .map(o => `${o.date}: ${o.value}`)
    .join("\n");

  return `
<series id="${seriesId}">
  <title>${title}</title>
  <summary>
    Mean: ${stats.mean}
    Min: ${stats.min.value} (${stats.min.date})
    Max: ${stats.max.value} (${stats.max.date})
    Latest: ${stats.latest.value} (${stats.latest.date})
    Trend (last 12 obs): ${stats.trendDirection} (slope: ${stats.trendSlope}/period)
    Total observations: ${stats.observationCount}
  </summary>
  <inflection_points>
${inflectionSummary || "  (none detected)"}
  </inflection_points>
  <observations>
${rawDataStr}
  </observations>
</series>`.trim();
}

/**
 * Pre-process raw FRED observations and return structured context.
 *
 * Use this in fred-agent.ts:
 *   case "get_series_data":
 *     const obs = await getSeriesData(...);
 *     return buildEnhancedToolResult(series_id, series_title, obs);
 */
export function buildEnhancedToolResult(
  seriesId: string,
  title: string,
  rawObservations: FredObservation[]
): string {
  const stats = computeStats(rawObservations);
  const inflections = findInflectionPoints(rawObservations);
  return buildSeriesContextBlock(seriesId, title, rawObservations, stats, inflections);
}
