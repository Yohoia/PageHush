import { useRef, useState, type ClipboardEvent, type FormEvent, type KeyboardEvent } from 'react';
import { motion } from 'motion/react';
import { useNavigate, useSearchParams } from 'react-router';
import { ApiError, loginWithAccessCode } from '@/lib/api';

const DIGIT_COUNT = 6;

function safeRedirect(value: string | null) {
  if (!value || !value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

function toDigits(value: string) {
  const enteredDigits = value.replace(/\D/g, '').slice(0, DIGIT_COUNT).split('');
  return Array.from({ length: DIGIT_COUNT }, (_, index) => enteredDigits[index] ?? '');
}

export function LoginPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [digits, setDigits] = useState<string[]>(() => Array(DIGIT_COUNT).fill(''));
  const [remember, setRemember] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);

  const focusDigit = (index: number) => {
    const nextIndex = Math.max(0, Math.min(DIGIT_COUNT - 1, index));
    inputRefs.current[nextIndex]?.focus();
    inputRefs.current[nextIndex]?.select();
  };

  const setPastedDigits = (value: string) => {
    const nextDigits = toDigits(value);
    setDigits(nextDigits);
    focusDigit(Math.min(nextDigits.filter(Boolean).length, DIGIT_COUNT - 1));
  };

  const handleDigitChange = (index: number, value: string) => {
    const digit = value.replace(/\D/g, '').slice(-1);
    setDigits((currentDigits) => {
      const nextDigits = [...currentDigits];
      nextDigits[index] = digit;
      return nextDigits;
    });

    if (digit) {
      focusDigit(index + 1);
    }
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    setPastedDigits(event.clipboardData.getData('text'));
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace' && !digits[index] && index > 0) {
      event.preventDefault();
      focusDigit(index - 1);
    }

    if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      focusDigit(index - 1);
    }

    if (event.key === 'ArrowRight' && index < DIGIT_COUNT - 1) {
      event.preventDefault();
      focusDigit(index + 1);
    }
  };

  const accessCode = digits.join('');
  const isComplete = digits.every((digit) => digit !== '');

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
        setDigits(Array(DIGIT_COUNT).fill(''));
        focusDigit(0);
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
          <div className="login-keys" role="group" aria-label="访问码">
            {digits.map((digit, index) => (
              <input
                key={index}
                ref={(element) => {
                  inputRefs.current[index] = element;
                }}
                className="login-key-input"
                type="password"
                value={digit}
                inputMode="numeric"
                autoComplete="off"
                maxLength={1}
                aria-label={`第 ${index + 1} 位，共 ${DIGIT_COUNT} 位`}
                aria-invalid={Boolean(error)}
                onChange={(event) => handleDigitChange(index, event.target.value)}
                onPaste={(event) => handlePaste(index, event)}
                onKeyDown={(event) => handleKeyDown(index, event)}
              />
            ))}
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
