import { useEffect, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router';
import type { DeviceVerificationResponse } from '@pagehush/shared';
import { ApiError, getDeviceVerification, verifyDevice } from '@/lib/api';

const statusMessages = {
  pending: '',
  approved: '已批准设备授权，请返回终端继续。',
  denied: '已拒绝设备授权。',
  consumed: '该设备已完成授权。可以在设备管理中查看或撤销。',
  expired: '设备码已过期，请返回终端重新登录。',
} satisfies Record<DeviceVerificationResponse['status'], string>;

function authorizationError(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 404) return '设备码无效，请核对终端显示的设备码。';
    if (error.status === 410) return '设备码已过期，请返回终端重新登录。';
    if (error.status === 409) return '该设备码已被处理，请重新查询授权状态。';
  }
  return '无法确认设备授权，请稍后重新查询。';
}

export function DeviceAuthorizationPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const queryCode = searchParams.get('user_code') ?? '';
  const [userCode, setUserCode] = useState(queryCode);
  const [verification, setVerification] = useState<DeviceVerificationResponse | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setUserCode(queryCode);
    setVerification(null);
    setError(null);
    if (!queryCode) {
      setBusy(false);
      return;
    }
    let cancelled = false;
    setBusy(true);
    getDeviceVerification(queryCode)
      .then((data) => {
        if (!cancelled) setVerification(data);
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(authorizationError(failure));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [queryCode]);

  function inspect(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const code = userCode.trim();
    if (busy || !code) return;
    if (code === queryCode) {
      setBusy(true);
      setError(null);
      setVerification(null);
      void getDeviceVerification(code)
        .then(setVerification)
        .catch((failure: unknown) => setError(authorizationError(failure)))
        .finally(() => setBusy(false));
    } else {
      setSearchParams({ user_code: code });
    }
  }

  async function decide(decision: 'approve' | 'deny') {
    if (!verification || verification.status !== 'pending' || busy) return;
    setBusy(true);
    setError(null);
    try {
      setVerification(await verifyDevice({ user_code: verification.user_code, decision }));
    } catch (failure) {
      setError(authorizationError(failure));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="page-content device-page" aria-busy={busy}>
      <h1>确认 CLI 设备授权</h1>
      <p className="device-introduction">核对终端上的设备码，只批准你本人发起的登录。</p>
      <form onSubmit={inspect} className="device-code-form">
        <label htmlFor="device-code">设备码</label>
        <div>
          <input
            id="device-code"
            value={userCode}
            onChange={(event) => setUserCode(event.target.value)}
            maxLength={32}
            autoComplete="off"
            spellCheck={false}
            required
          />
          <button type="submit" disabled={busy || !userCode.trim()}>
            查询设备
          </button>
        </div>
      </form>
      {error ? (
        <p role="alert" className="device-error">
          {error}
        </p>
      ) : null}
      {verification ? (
        <div className="device-authorization">
          <h2>{verification.name}</h2>
          <p className="device-user-code">{verification.user_code}</p>
          {verification.status === 'pending' ? (
            <>
              <p>此设备可读取文章、新增草稿、发布及软删除文章，并上传文章内嵌图片。</p>
              <p>授权有效期为 30 天，可随时在设备管理中撤销。</p>
              <div className="device-authorization-actions">
                <button type="button" disabled={busy} onClick={() => void decide('deny')}>
                  拒绝授权
                </button>
                <button type="button" disabled={busy} onClick={() => void decide('approve')}>
                  批准授权
                </button>
              </div>
            </>
          ) : (
            <p role="status">{statusMessages[verification.status]}</p>
          )}
        </div>
      ) : null}
      <Link to="/devices" className="device-management-link">
        查看设备授权
      </Link>
    </section>
  );
}
