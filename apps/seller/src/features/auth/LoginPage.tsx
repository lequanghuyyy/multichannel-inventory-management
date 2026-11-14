import { useRef, useState, type FormEvent } from 'react';
import octoflowMark from '../../assets/octoflow-mark-dark.svg';
import { ApiRequestError, presentApiError } from '../../core/api-error';
import { useAuth } from './AuthProvider';
import './LoginPage.css';

export function LoginPage({ onSuccess }: { onSuccess: () => void }) {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const submittingRef = useRef(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password || submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      onSuccess();
    } catch (nextError: unknown) {
      setError(nextError);
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const message = error instanceof ApiRequestError && error.code === 'INVALID_CREDENTIALS'
    ? { title: 'Đăng nhập không thành công', detail: 'Thông tin đăng nhập không hợp lệ.' }
    : error ? presentApiError(error) : null;

  return (
    <main className="login-page">
      <div className="login-page__texture" aria-hidden="true" />

      <header className="login-header">
        <div className="login-header__inner">
          <div className="login-brand" aria-label="OctoFlow">
            <span className="login-brand__mark">
              <img src={octoflowMark} alt="" />
            </span>
            <span className="login-brand__name">OctoFlow</span>
          </div>
        </div>
      </header>

      <div className="login-content">
        <section className="login-intro" aria-labelledby="login-welcome">
          <p className="login-kicker"><span aria-hidden="true" /> Quản lý bán hàng đa kênh</p>
          <h1 id="login-welcome">
            Tồn kho chính xác.
            <span>Bán hàng thông suốt.</span>
          </h1>
          <p className="login-intro__description">
            Theo dõi hàng hóa trên mọi kênh bán, giảm sai lệch và tránh bán vượt tồn.
          </p>
        </section>

        <section className="login-card" aria-labelledby="login-title">
          <div className="login-card__heading">
            <h2 id="login-title">Đăng nhập OctoFlow</h2>
            <p>Sử dụng email và mật khẩu tài khoản được cấp.</p>
          </div>

          <form className="login-form" onSubmit={event => void submit(event)}>
            <div className="login-field">
              <label htmlFor="email">Email</label>
              <div className="login-field__control">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <path d="M4 6.75h16v10.5H4z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                  <path d="m4.75 7.5 7.25 5.75 7.25-5.75" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <input
                  id="email"
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={event => {
                    setEmail(event.target.value);
                    setError(null);
                  }}
                  placeholder="you@example.com"
                />
              </div>
            </div>

            <div className="login-field">
              <label htmlFor="password">Mật khẩu</label>
              <div className="login-field__control">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <rect x="5" y="10" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M8 10V7a4 4 0 0 1 8 0v3m-4 4v2" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={event => {
                    setPassword(event.target.value);
                    setError(null);
                  }}
                  placeholder="Nhập mật khẩu"
                />
                <button
                  className="login-password-toggle"
                  type="button"
                  onClick={() => setShowPassword(previous => !previous)}
                  aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  aria-controls="password"
                  aria-pressed={showPassword}
                >
                  {showPassword ? (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                      <path d="M3 3l18 18M10.6 10.7a2 2 0 0 0 2.7 2.7" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                      <path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c4.5 0 8.2 2.9 9.5 7a10.8 10.8 0 0 1-3.2 4.6M6.2 6.3A10.8 10.8 0 0 0 2.5 12c.6 2 1.9 3.7 3.5 4.9a10.5 10.5 0 0 0 6 2.1c1.1 0 2.2-.2 3.2-.5" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : (
                    <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                      <path d="M2.5 12s3.4-7 9.5-7 9.5 7 9.5 7-3.4 7-9.5 7-9.5-7-9.5-7Z" stroke="currentColor" strokeWidth="1.7" strokeLinejoin="round" />
                      <circle cx="12" cy="12" r="2.5" stroke="currentColor" strokeWidth="1.7" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {message ? (
              <div className="login-error" role="alert">
                <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
                  <path d="M12 8v4m0 4h.01" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
                </svg>
                <span>
                  <strong>{message.title}</strong>
                  <span>{message.detail}</span>
                </span>
              </div>
            ) : null}

            <button
              className="login-submit"
              type="submit"
              disabled={submitting || !email.trim() || !password}
            >
              {submitting ? (
                <>
                  <span className="login-submit__spinner" aria-hidden="true" />
                  <span>Đang đăng nhập…</span>
                </>
              ) : (
                <>
                  <span>Đăng nhập</span>
                  <svg aria-hidden="true" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14m-6-6 6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </>
              )}
            </button>
          </form>
        </section>
      </div>
    </main>
  );
}
