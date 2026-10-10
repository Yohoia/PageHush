export const workerName = 'pagehush-worker';

export interface WorkerConfig {
  enabled: boolean;
  pollIntervalMs: number;
}

export function readWorkerConfig(): WorkerConfig {
  const rawInterval = Number(process.env.PAGEHUSH_WORKER_POLL_INTERVAL_MS ?? '5000');
  return {
    enabled: process.env.PAGEHUSH_WORKER_ENABLED === 'true',
    pollIntervalMs: Number.isFinite(rawInterval) ? Math.max(1000, rawInterval) : 5000,
  };
}

/**
 * Placeholder task runner. Its first real task will be materializing publish
 * snapshots: copy draft assets to the public prefix via StoragePort.copyObject,
 * export the content package, and hand it to the Astro build. Do not add
 * unrelated background jobs here before that pipeline exists.
 */
if (process.env.PAGEHUSH_WORKER_RUN !== 'false') {
  const config = readWorkerConfig();
  if (!config.enabled) {
    console.log(`${workerName}: disabled; publishing tasks will not run.`);
  } else {
    console.log(
      `${workerName}: enabled; poll interval ${config.pollIntervalMs}ms. Publish snapshot tasks will be implemented with the server deployment.`,
    );
  }
}
