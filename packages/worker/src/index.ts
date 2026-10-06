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

if (process.env.PAGEHUSH_WORKER_RUN !== 'false') {
  const config = readWorkerConfig();
  if (!config.enabled) {
    console.log(`${workerName}: disabled; publishing tasks will not run.`);
  } else {
    console.log(
      `${workerName}: enabled; poll interval ${config.pollIntervalMs}ms. Task processing will be implemented with the server deployment.`,
    );
  }
}
