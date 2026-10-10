import { useState, type FormEvent } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiError, loginWithAccessCode } from '@/lib/api';

const MIN_CODE_LENGTH = 6;
const MAX_CODE_LENGTH = 128;

function safeRedirect(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [accessCode, setAccessCode] = useState('');
  const [remember, setRemember] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isComplete = accessCode.length >= MIN_CODE_LENGTH;

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!isComplete || isSubmitting) return;

    setIsSubmitting(true);
    setError(null);

    try {
      await loginWithAccessCode(accessCode, remember);
      navigate(safeRedirect(searchParams.get('redirect')), { replace: true });
    } catch (submitError) {
      if (submitError instanceof ApiError && submitError.code === 'invalid_access_code') {
        setError('访问码不正确，请重新输入。');
        setAccessCode('');
      } else if (
        submitError instanceof ApiError &&
        submitError.code === 'access_code_not_configured'
      ) {
        setError('访问码尚未配置，请先在服务器环境变量中配置。');
      } else {
        setError('暂时无法登录，请稍后再试。');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <main className="login-page">
      <motion.section
        className="login-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.28, ease: [0.22, 0.7, 0.26, 1] }}
      >
        <div className="login-brand">
          <img src="/brand/logo-128.png" alt="" />
          <img src="/brand/chinese-logo.png" alt="页息" />
        </div>

        <h1>访问码</h1>
        <p>输入写在你私人备忘里的钥匙。</p>

        <form onSubmit={handleSubmit}>
          <div className="login-keys">
            <input
              className="login-key-input login-code-input"
              type="password"
              value={accessCode}
              autoComplete="off"
              spellCheck={false}
              minLength={MIN_CODE_LENGTH}
              maxLength={MAX_CODE_LENGTH}
              aria-label="访问码"
              aria-invalid={Boolean(error)}
              autoFocus
              onChange={(event) => setAccessCode(event.target.value.trim())}
            />
          </div>

          {error ? (
            <p id="login-error" className="login-error" role="alert">
              {error}
            </p>
          ) : null}

          <button type="submit" disabled={isSubmitting || !isComplete}>
            {isSubmitting ? '正在验证…' : '解锁页息'}
          </button>

          <div className="login-options">
            <label className="login-remember">
              <input
                type="checkbox"
                checked={remember}
                onChange={(event) => setRemember(event.target.checked)}
              />
              信任此设备
            </label>
            <span>{remember ? '30 天内免输入' : '关闭浏览器后需重新输入'}</span>
          </div>
        </form>
      </motion.section>
    </main>
  );
}
