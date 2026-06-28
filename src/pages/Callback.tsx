import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { completeLogin } from '../auth';
import { Logo } from '../App';

/** OAuth redirect target: exchanges the code (PKCE) for tokens, then returns to the app. */
export function Callback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    completeLogin()
      .then(() => navigate('/', { replace: true }))
      .catch((e) => setError(e?.message ?? String(e)));
  }, [navigate]);

  return (
    <div className="min-h-screen grid place-items-center px-6">
      <div className="text-center">
        <Logo />
        {error ? (
          <div className="mt-5 max-w-md">
            <p className="text-sm font-semibold text-red-600">Sign-in failed</p>
            <p className="mt-1 text-xs mono text-[color:var(--color-ink-soft)] break-all">{error}</p>
            <a href="/" className="mt-4 inline-block text-sm text-[color:var(--color-brand-600)] underline">
              Back to start
            </a>
          </div>
        ) : (
          <p className="mt-4 text-sm text-[color:var(--color-ink-soft)]">Completing sign-in…</p>
        )}
      </div>
    </div>
  );
}
