import { useEffect, useState } from 'react';
import type { DeviceListResponse } from '@pagehush/shared';
import { listDevices, revokeDevice } from '@/lib/api';

function formatDate(value: string) {
  return new Date(value).toLocaleString('zh-CN');
}

export function DevicesPage() {
  const [devices, setDevices] = useState<DeviceListResponse['items']>([]);
  const [loading, setLoading] = useState(true);
  const [revoking, setRevoking] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listDevices()
      .then((data) => {
        if (!cancelled) setDevices(data.items);
      })
      .catch(() => {
        if (!cancelled) setError('无法读取设备授权，请稍后重试。');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function revoke(id: string) {
    if (revoking) return;
    setRevoking(id);
    setError(null);
    try {
      await revokeDevice(id);
      const data = await listDevices();
      setDevices(data.items);
    } catch {
      setError('未能确认撤销结果，请刷新设备列表核对后重试。');
    } finally {
      setRevoking(null);
    }
  }

  return (
    <section className="page-content device-page" aria-busy={loading}>
      <h1>设备授权</h1>
      <p className="device-introduction">查看已授权的 CLI 设备。撤销后，设备将不能继续访问文章。</p>
      {error ? (
        <p role="alert" className="device-error">
          {error}
        </p>
      ) : null}
      {loading ? <p role="status">正在读取设备…</p> : null}
      {!loading && !error && devices.length === 0 ? <p>暂无设备授权</p> : null}
      <ul className="device-list">
        {devices.map((device) => {
          const expired = Date.parse(device.expiresAt) <= Date.now();
          const status = device.revokedAt ? '已撤销' : expired ? '已过期' : '有效';
          return (
            <li key={device.id} className="device-card">
              <div>
                <h2>{device.name}</h2>
                <p>状态：{status}</p>
                <p>授权时间：{formatDate(device.createdAt)}</p>
                <p>最近使用：{formatDate(device.lastUsedAt)}</p>
                <p>到期时间：{formatDate(device.expiresAt)}</p>
              </div>
              {!device.revokedAt && !expired ? (
                <button
                  type="button"
                  disabled={Boolean(revoking)}
                  aria-label={`撤销授权：${device.name}`}
                  onClick={() => void revoke(device.id)}
                >
                  {revoking === device.id ? '正在撤销…' : '撤销授权'}
                </button>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
