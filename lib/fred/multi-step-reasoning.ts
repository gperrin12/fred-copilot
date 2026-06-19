/**
 * multi-step-reasoning.ts
 *
 * Multi-step reasoning chain for analyzing rate-cutting cycles and their
 * effect on economic indicators (e.g., credit delinquency).
 *
 * The chain: deterministic computation in TypeScript, interpretation in Claude.
 *   Step 1: Identify Fed rate-cutting cycle start dates (FEDFUNDS)
 *   Step 2: Align frequencies (quarterly to monthly via forward-fill)
 *   Step 3: Slice indicator windows after each cycle
 *   Step 4: Ask Claude to reason about the historical pattern
 *
 * Use case: "What typically happens to credit delinquency 6 months after the Fed cuts?"
 *
 * FRED series:
 *   FEDFUNDS    - Federal Funds Rate (monthly)
 *   DRCCLACBS   - Consumer Credit Card Delinquency Rate (quarterly, SA)
 */

import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

export interface FredObservation {
  date: string;
  value: number;
}

export interface RateCuttingCycle {
  startDate: string;
  fedFundsAtStart: number;
  threeMonthChange: number;
  label: string;
  isAnomalous?: boolean;
}

export interface DelinquencyWindow {
  cycleStartDate: string;
  windowStartDate: string;
  observations: FredObservation[];
  stats: {
    startValue: number;
    endValue: number;
    changeAbsolute: number;
    changePct: number;
    direction: "rising" | "falling" | "flat";
  };
}

// ─── Step 1: Rate-Cutting Cycle Detection ──────────────────────────────────

function labelCycle(year: number): string {
  if (year <= 2002) return "2001 Post-Bubble / 9-11 Easing Cycle";
  if (year <= 2009) return "2007-08 GFC Easing Cycle";
  if (year === 2019) return "2019 Insurance Cuts";
  if (year === 2020) return "2020 COVID Emergency Cuts";
  if (year >= 2024) return `${year} Rate-Cutting Cycle`;
  return `${year} Easing Cycle`;
}

/**
 * Identify Fed rate-cutting cycle start dates from FEDFUNDS monthly data.
 *
 * Two-pass approach:
 *   Pass 1: Mark every month where 3-month change < -0.25pp as "cutting"
 *   Pass 2: Find the FIRST month in each consecutive cutting run (cycle start)
 *
 * Why two-pass: a single-pass would flag every month of a multi-year cycle
 * (2007-08 lasted 16 months). We want only the cycle start.
 *
 * @param fedfunds - Monthly FEDFUNDS observations, sorted ascending
 * @param thresholdPP - 3-month change threshold for detection (default: -0.25)
 */
export function identifyRateCuttingCycles(
  fedfunds: FredObservation[],
  thresholdPP = -0.25
): RateCuttingCycle[] {
  if (fedfunds.length < 4) return [];

  const cuttingFlags: boolean[] = new Array(fedfunds.length).fill(false);
  for (let i = 3; i < fedfunds.length; i++) {
    const threeMonthChange = fedfunds[i].value - fedfunds[i - 3].value;
    cuttingFlags[i] = threeMonthChange < thresholdPP;
  }

  const cycles: RateCuttingCycle[] = [];
  for (let i = 1; i < fedfunds.length; i++) {
    if (cuttingFlags[i] && !cuttingFlags[i - 1]) {
      const year = new Date(fedfunds[i].date).getFullYear();
      const threeMonthChange = fedfunds[i].value - fedfunds[i - 3].value;

      cycles.push({
        startDate: fedfunds[i].date,
        fedFundsAtStart: fedfunds[i].value,
        threeMonthChange: parseFloat(threeMonthChange.toFixed(3)),
        label: labelCycle(year),
        isAnomalous: year === 2020,
      });
    }
  }

  return cycles;
}

// ─── Step 2 & 3: Frequency Alignment + Window Slicing ────────────────────

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}

/**
 * Forward-fill quarterly observations to monthly frequency.
 *
 * Design: forward-fill rather than interpolation.
 *
 * Why: quarterly delinquency rates are stock measures. The Oct 1 value
 * represents the state at end of Q3, and persists until the Q4 reading.
 * Forward-filling captures this; linear interpolation would imply a
 * smooth transition that doesn't match the data-collection reality.
 *
 * @param quarterlyObs - Quarterly observations, sorted ascending
 * @param startDate - First month to include ("YYYY-MM-DD")
 * @param endDate - Last month to include ("YYYY-MM-DD")
 */
export function forwardFillToMonthly(
  quarterlyObs: FredObservation[],
  startDate: string,
  endDate: string
): FredObservation[] {
  const monthly: FredObservation[] = [];

  const start = new Date(startDate);
  const end = new Date(endDate);

  const current = new Date(start.getFullYear(), start.getMonth(), 1);
  while (current <= end) {
    const dateStr = formatDate(current);

    const latestQObs = [...quarterlyObs]
      .reverse()
      .find((o) => o.date <= dateStr);

    if (latestQObs) {
      monthly.push({ date: dateStr, value: latestQObs.value });
    }

    current.setMonth(current.getMonth() + 1);
  }

  return monthly;
}

/**
 * Extract a window of monthly indicator data starting at a cycle start date.
 *
 * @param monthlyDelinquency - Forward-filled monthly observations
 * @param cycleStartDate - First month of the Fed cutting cycle
 * @param windowMonths - Number of months to include (default: 6)
 */
export function sliceDelinquencyWindow(
  monthlyDelinquency: FredObservation[],
  cycleStartDate: string,
  windowMonths = 6
): DelinquencyWindow | null {
  const startIndex = monthlyDelinquency.findIndex((o) => o.date >= cycleStartDate);
  if (startIndex === -1) return null;

  if (startIndex + windowMonths > monthlyDelinquency.length) return null;

  const window = monthlyDelinquency.slice(startIndex, startIndex + windowMonths);
  const startValue = window[0].value;
  const endValue = window[window.length - 1].value;
  const changeAbsolute = parseFloat((endValue - startValue).toFixed(3));
  const changePct = parseFloat(((endValue / startValue - 1) * 100).toFixed(2));

  const direction: "rising" | "falling" | "flat" =
    changeAbsolute > 0.1 ? "rising" : changeAbsolute < -0.1 ? "falling" : "flat";

  return {
    cycleStartDate,
    windowStartDate: window[0].date,
    observations: window,
    stats: { startValue, endValue, changeAbsolute, changePct, direction },
  };
}

// ─── Step 4: Context Block + Model Call ────────────────────────────────────

/**
 * Build XML context block for multi-cycle pattern reasoning.
 *
 * Design:
 * - XML tags with attributes (label, start_date) → easy reference in response
 * - Anomalous cycles flagged but included (not filtered) → model notes the exception
 * - Monthly data per window → model sees trajectory, not just start/end values
 */
export function buildMultiCycleContextBlock(
  cycles: RateCuttingCycle[],
  windows: DelinquencyWindow[]
): string {
  const cycleBlocks = cycles
    .map((cycle) => {
      const window = windows.find((w) => w.cycleStartDate === cycle.startDate);
      const windowBlock = window
        ? `    <delinquency_6m_window>
      <start_value>${window.stats.startValue}</start_value>
      <end_value>${window.stats.endValue}</end_value>
      <change>${window.stats.changeAbsolute > 0 ? "+" : ""}${window.stats.changeAbsolute} pp (${window.stats.changePct}%)</change>
      <direction>${window.stats.direction}</direction>
      <monthly_data>
${window.observations.map((o) => `        ${o.date}: ${o.value}`).join("\n")}
      </monthly_data>
    </delinquency_6m_window>`
        : `    <delinquency_6m_window>
      <note>Insufficient data for a full 6-month window at this cycle start</note>
    </delinquency_6m_window>`;

      return `  <cycle label="${cycle.label}" start_date="${cycle.startDate}" fedfunds_at_start="${cycle.fedFundsAtStart}" three_month_change="${cycle.threeMonthChange}">
${cycle.isAnomalous ? "    <anomalous>true — driven by exogenous shock (COVID-19), not rate cycle mechanics</anomalous>\n" : ""}${windowBlock}
  </cycle>`;
    })
    .join("\n");

  return `<rate_cutting_cycles series="DRCCLACBS" units="percent_delinquent_SA" window_months="6">
${cycleBlocks}
</rate_cutting_cycles>`;
}

/**
 * Ask Claude to reason about historical pattern across multiple cycles.
 *
 * This is the only step involving a model call. Computation (cycle detection,
 * frequency alignment, window slicing) happens in TypeScript beforehand.
 * Claude's job: interpret the patterns and synthesize narrative.
 */
export async function reasonAboutPattern(contextBlock: string): Promise<string> {
  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    messages: [
      {
        role: "user",
        content: `You are analyzing historical Federal Reserve rate-cutting cycles and their effect on consumer credit card delinquency rates (DRCCLACBS, seasonally adjusted).

The following data shows, for each rate-cutting cycle, the FEDFUNDS rate at the start of cutting, and the month-by-month DRCCLACBS delinquency rate over the following 6 months.

${contextBlock}

Based on this historical data, answer the following question precisely:
What typically happens to consumer credit card delinquency rates in the 6 months after the Fed begins cutting rates?

Your response should address:
1. The direction and typical magnitude of the change across non-anomalous cycles
2. The consistency of the pattern (does it hold in every non-anomalous cycle?)
3. The anomalous cycle(s) and why they should be interpreted differently
4. What the pattern implies about the timing relationship between rate cuts and credit stress

Cite specific dates and values from the data. Do not draw conclusions beyond what the data supports.`,
      },
    ],
  });

  return response.content[0].type === "text" ? response.content[0].text : "";
}

// ─── Orchestration ────────────────────────────────────────────────────────

export async function analyzeDelinquencyAfterRateCuts(
  fedfunds: FredObservation[],
  drcclacbs: FredObservation[]
): Promise<{
  cycles: RateCuttingCycle[];
  windows: DelinquencyWindow[];
  narrative: string;
}> {
  const cycles = identifyRateCuttingCycles(fedfunds);
  console.log(`Found ${cycles.length} rate-cutting cycles:`, cycles.map((c) => c.label));

  const seriesStart = fedfunds[0]?.date ?? "2000-01-01";
  const seriesEnd = fedfunds[fedfunds.length - 1]?.date ?? "2024-12-01";
  const monthlyDelinquency = forwardFillToMonthly(drcclacbs, seriesStart, seriesEnd);

  const windows: DelinquencyWindow[] = [];
  for (const cycle of cycles) {
    const window = sliceDelinquencyWindow(monthlyDelinquency, cycle.startDate);
    if (window) {
      windows.push(window);
    } else {
      console.warn(`Insufficient delinquency data for cycle starting ${cycle.startDate}`);
    }
  }

  const contextBlock = buildMultiCycleContextBlock(cycles, windows);
  const narrative = await reasonAboutPattern(contextBlock);

  return { cycles, windows, narrative };
}
