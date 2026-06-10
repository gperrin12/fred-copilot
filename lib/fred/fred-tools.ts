/**
 * fred-tools.ts
 *
 * The four FRED API tool implementations for fred-copilot.
 * Each function corresponds to one tool in the Claude agent's tool schema.
 *
 * FRED API base URL: https://api.stlouisfed.org/fred/
 * Auth: api_key query parameter on every request
 * Always request: file_type=json (default is XML — don't do that)
 */

// ─── FRED API response types ───────────────────────────────────────────────

interface FredSeries {
  id: string;
  title: string;
  frequency: string;
  frequency_short: string;
  units: string;
  units_short: string;
  seasonal_adjustment: string;
  seasonal_adjustment_short: string;
  last_updated: string;
  observation_start: string;
  observation_end: string;
  popularity: number;
}

interface FredObservation {
  realtime_start: string;
  realtime_end: string;
  date: string;
  value: string; // "." means missing data — handle this!
}

// ─── Tool return types ─────────────────────────────────────────────────────

export interface SeriesSearchResult {
  id: string;
  title: string;
  frequency: string;
  units: string;
  seasonal_adjustment: string;
  popularity: number;
}

export interface SeriesInfo {
  id: string;
  title: string;
  frequency: string;
  units: string;
  seasonal_adjustment: string;
  last_updated: string;
  observation_start: string;
  observation_end: string;
}

export interface SeriesObservation {
  date: string;
  value: number | null; // null for "." missing data sentinel
}

export interface ReleaseSeriesResult {
  id: string;
  title: string;
  frequency: string;
  units: string;
}

// ─── Tool implementations ──────────────────────────────────────────────────

/**
 * search_series — analogous to list_tables in nl2sql-nyc.
 * Searches the FRED catalog by keyword and returns candidate series.
 * The agent should call this whenever a series_id is uncertain.
 *
 * FRED endpoint: GET /fred/series/search?search_text=...&limit=10
 * Note: the response field is `seriess` (double-s). Yes, really.
 */
export async function searchSeries(query: string): Promise<SeriesSearchResult[]> {
  const params = new URLSearchParams({
    search_text: query,
    limit: "10",
    file_type: "json",
    api_key: process.env.FRED_API_KEY ?? "",
  });

  const response = await fetch(
    `https://api.stlouisfed.org/fred/series/search?${params}`
  );

  if (!response.ok) {
    throw new Error(`FRED API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    seriess?: FredSeries[];
    error_message?: string;
  };

  if (data.error_message) {
    throw new Error(`FRED API error: ${data.error_message}`);
  }

  // Results live at data.seriess (double-s). Empty array is valid — no matches.
  if (!data.seriess?.length) {
    return [];
  }

  return data.seriess.map((series) => ({
    id: series.id,
    title: series.title,
    frequency: series.frequency_short,
    units: series.units,
    seasonal_adjustment: series.seasonal_adjustment_short,
    popularity: series.popularity,
  }));
}

/**
 * get_series_info — analogous to get_schema in nl2sql-nyc.
 * Returns metadata for a known series: title, units, frequency, seasonal adjustment.
 * The agent should call this before interpreting data values — context is required.
 *
 * FRED endpoint: GET /fred/series?series_id=...
 * Also useful as a series_id validator: if data.seriess is empty, the ID doesn't exist.
 */
export async function getSeriesInfo(seriesId: string): Promise<SeriesInfo> {
  // TODO: Build the URL with series_id, file_type=json, api_key

  // TODO: Fetch and parse the response

  // TODO: Validate the response — if data.seriess is empty or missing, throw:
  //   throw new Error(`Series not found: ${seriesId}`)
  //   This prevents the agent from getting a silent empty result

  // TODO: Return the first (and only) result as SeriesInfo with these fields:
  //   id, title, frequency, units, seasonal_adjustment, last_updated,
  //   observation_start, observation_end

  throw new Error("getSeriesInfo not yet implemented");
}

/**
 * get_series_data — analogous to run_query in nl2sql-nyc.
 * Fetches the actual time series observations.
 *
 * FRED endpoint: GET /fred/series/observations?series_id=...&observation_start=...
 *
 * CRITICAL: FRED uses "." (a period string) to represent missing data.
 * A monthly series might have "." for a quarter that hasn't been reported yet,
 * or for periods outside the series' coverage. Always convert "." to null.
 *
 * @param observationEnd - optional; omit to get data through today
 */
export async function getSeriesData(
  seriesId: string,
  observationStart: string,
  observationEnd?: string
): Promise<SeriesObservation[]> {
  // TODO: Build the URL with:
  //   - series_id: seriesId
  //   - observation_start: observationStart
  //   - observation_end: observationEnd (only if provided)
  //   - file_type: "json"
  //   - api_key: process.env.FRED_API_KEY

  // TODO: Fetch and parse the response

  // TODO: Map each observation to SeriesObservation:
  //   - date: obs.date (keep as-is, "YYYY-MM-DD")
  //   - value: obs.value === "." ? null : parseFloat(obs.value)
  //
  // Do NOT pass realtime_start or realtime_end to the model — those are
  // revision tracking fields that add noise without helping the agent reason.

  throw new Error("getSeriesData not yet implemented");
}

/**
 * get_release — returns all series in a FRED data release.
 * Releases group related series published together.
 * Example: release 21 is "Employment Situation" (includes UNRATE, PAYEMS, etc.)
 *
 * FRED endpoint: GET /fred/release/series?release_id=...&limit=20
 */
export async function getRelease(releaseId: string): Promise<ReleaseSeriesResult[]> {
  // TODO: Build the URL with:
  //   - release_id: releaseId
  //   - limit: 20 (cap at 20 to avoid overwhelming the agent with a huge list)
  //   - file_type: "json"
  //   - api_key: process.env.FRED_API_KEY

  // TODO: Fetch and parse the response

  // TODO: Map each result to ReleaseSeriesResult:
  //   id, title, frequency_short (as frequency), units

  throw new Error("getRelease not yet implemented");
}
