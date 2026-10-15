import { MAX_ONLINE_CHECK_SECONDS, MIN_ONLINE_CHECK_SECONDS } from "./policy";

/** What a Firestore project on the free plan includes each day. Beyond this it is charged per operation. */
export const FREE_DAILY_READS = 50_000;
export const FREE_DAILY_WRITES = 20_000;

/** The database reads one licence request costs, besides one per device on the licence: the settings, the licence, its plan and its customer. */
export const READS_PER_CHECK_BASE = 4;

export interface LoadInput {
  /** One entry per licence in use: how many devices (the server PC plus each till) check in. */
  devicesPerLicence: number[];
  /** The longest wait between checks, in minutes (Settings; 1 to 3). */
  checkIntervalMinutes: number;
  /** How often an unchanged device is recorded (Settings; 1 to 15 minutes). */
  activityWriteMinutes: number;
}

export interface LoadEstimate {
  /** The average wait between two checks of the same PC (the wait is random between 1 minute and the setting). */
  avgWaitSeconds: number;
  /** PCs checked per day (every PC in every shop, each cycle). */
  checksPerDay: number;
  /** Requests the website receives per day. A shop's server PC checks all its tills in ONE request, so this is one per shop per cycle. */
  requestsPerDay: number;
  readsPerDay: number;
  writesPerDay: number;
  /** What the writes would be if every check were recorded (no recording limit), to show what that setting saves. */
  writesWithoutThrottle: number;
  /** What the reads would be if every till were checked in its own request (the old way), to show what batching saves. */
  readsWithoutBatching: number;
}

/**
 * A realistic day of database work for the licence checks, for the admin to plan with. In each check cycle the shop's server PC asks
 * about itself and every till in ONE request, which reads the licence, its plan, its customer, the settings and the licence's n
 * devices once (4 + n reads). Without batching, each of the n PCs would make its own request and re-read the n devices each time.
 */
export function estimateLoad(i: LoadInput): LoadEstimate {
  const maxSeconds = Math.min(MAX_ONLINE_CHECK_SECONDS, Math.max(1, Math.floor(i.checkIntervalMinutes * 60)));
  const minSeconds = Math.min(MIN_ONLINE_CHECK_SECONDS, maxSeconds);
  const avgWaitSeconds = (minSeconds + maxSeconds) / 2;
  const cyclesPerDay = 86_400 / avgWaitSeconds;
  const writeEvery = Math.min(15, Math.max(1, i.activityWriteMinutes));
  const recordsPerDay = 1_440 / writeEvery;

  let checks = 0;
  let requests = 0;
  let reads = 0;
  let readsOld = 0;
  let writes = 0;
  for (const raw of i.devicesPerLicence) {
    const n = Math.max(1, Math.floor(raw));
    checks += n * cyclesPerDay;
    requests += cyclesPerDay;
    reads += cyclesPerDay * (READS_PER_CHECK_BASE + n);
    readsOld += n * cyclesPerDay * (READS_PER_CHECK_BASE + n);
    writes += recordsPerDay * (1 + n); // the licence record once, and each device once, per recording interval
  }
  return {
    avgWaitSeconds,
    checksPerDay: Math.round(checks),
    requestsPerDay: Math.round(requests),
    readsPerDay: Math.round(reads),
    writesPerDay: Math.round(writes),
    writesWithoutThrottle: Math.round(checks * 2), // every check rewrites the licence and the device
    readsWithoutBatching: Math.round(readsOld),
  };
}
