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
  // 1. Build query params. URLSearchParams encodes spaces/special chars in the query.
  //    limit=10 caps results so the agent gets enough candidates without token bloat.
  const params = new URLSearchParams({
    search_text: query,
    limit: "10",
    file_type: "json",
    api_key: process.env.FRED_API_KEY ?? "",
  });

  // 2. Hit the series/search endpoint — full-text search across titles, units, tags, etc.
  const response = await fetch(
    `https://api.stlouisfed.org/fred/series/search?${params}`
  );

  // 3. HTTP-level failure (bad key, rate limit, server error).
  if (!response.ok) {
    throw new Error(`FRED API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    seriess?: FredSeries[];
    error_message?: string;
  };

  // 4. FRED returns 200 with an error_message body for invalid params, etc.
  if (data.error_message) {
    throw new Error(`FRED API error: ${data.error_message}`);
  }

  // 5. Matches live in data.seriess (double-s — FRED API quirk).
  //    Empty array means no matches; that's valid, not an error.
  if (!data.seriess?.length) {
    return [];
  }

  // 6. Strip each result down to fields the agent needs to pick the right series.
  //    We use *_short variants for frequency/seasonal_adjustment to save tokens.
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
  // 1. Look up a single series by its exact ID (e.g. "UNRATE").
  const params = new URLSearchParams({
    series_id: seriesId,
    file_type: "json",
    api_key: process.env.FRED_API_KEY ?? "",
  });

  const response = await fetch(
    `https://api.stlouisfed.org/fred/series?${params}`
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

  // 2. FRED returns seriess as an array even for a single lookup.
  //    Empty array = invalid/guessed series_id — throw so the agent retries via search_series.
  if (!data.seriess?.length) {
    throw new Error(`Series not found: ${seriesId}`);
  }

  const series = data.seriess[0];

  // 3. Return metadata the agent needs before interpreting data values.
  //    observation_start/end tell the agent the series' full date range;
  //    last_updated helps flag stale or discontinued series.
  return {
    id: series.id,
    title: series.title,
    frequency: series.frequency_short,
    units: series.units,
    seasonal_adjustment: series.seasonal_adjustment_short,
    last_updated: series.last_updated,
    observation_start: series.observation_start,
    observation_end: series.observation_end,
  };
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
  // 1. Build params. observation_start/end filter the *economic time period*
  //    (not realtime_start/end, which control revision vintages — we ignore those).
  const params = new URLSearchParams({
    series_id: seriesId,
    observation_start: observationStart,
    file_type: "json",
    api_key: process.env.FRED_API_KEY ?? "",
  });

  // 2. Only send observation_end when the agent specified one.
  //    Omitting it lets FRED default to 9999-12-31 (latest available).
  if (observationEnd) {
    params.set("observation_end", observationEnd);
  }

  const response = await fetch(
    `https://api.stlouisfed.org/fred/series/observations?${params}`
  );

  if (!response.ok) {
    throw new Error(`FRED API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as {
    observations?: FredObservation[];
    error_message?: string;
  };

  if (data.error_message) {
    throw new Error(`FRED API error: ${data.error_message}`);
  }

  if (!data.observations?.length) {
    throw new Error(`No observations found for series: ${seriesId}`);
  }

  // 3. Map each observation to { date, value }.
  //    FRED uses "." for missing/unreleased data — convert to null so the
  //    agent doesn't try to parse it as a number.
  //    We drop realtime_start/end from the response; they're revision metadata.
  return data.observations.map((observation) => ({
    date: observation.date,
    value: observation.value === "." ? null : parseFloat(observation.value),
  }));
}

/**
 * get_release — returns all series in a FRED data release.
 * Releases group related series published together.
 * Example: release 21 is "Employment Situation" (includes UNRATE, PAYEMS, etc.)
 *
 * FRED endpoint: GET /fred/release/series?release_id=...&limit=20
 */
export async function getRelease(releaseId: string): Promise<ReleaseSeriesResult[]> {
  // 1. A "release" is a bundle of related series published together
  //    (e.g. release 21 = Employment Situation → UNRATE, PAYEMS, etc.).
  const params = new URLSearchParams({
    release_id: releaseId,
    limit: "20",
    file_type: "json",
    api_key: process.env.FRED_API_KEY ?? "",
  });

  const response = await fetch(
    `https://api.stlouisfed.org/fred/release/series?${params}`
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

  // 2. Empty seriess = invalid release_id or no series in the release.
  if (!data.seriess?.length) {
    return [];
  }

  // 3. Return a lightweight list so the agent can browse what's in a release
  //    without fetching full metadata for every series upfront.
  return data.seriess.map((series) => ({
    id: series.id,
    title: series.title,
    frequency: series.frequency_short,
    units: series.units,
  }));
}
