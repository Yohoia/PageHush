import { describe, expect, it } from 'vitest';
import { readWorkerConfig, workerName } from './index';

describe('worker configuration', () => {
  it('is disabled unless explicitly enabled', () => {
    process.env.PAGEHUSH_WORKER_ENABLED = 'false';
    expect(readWorkerConfig()).toMatchObject({ enabled: false, pollIntervalMs: 5000 });
    expect(workerName).toBe('pagehush-worker');
  });
});
