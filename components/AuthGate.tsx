'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

/**
 * Holds the session and renders the sign-in screen until there is one.
 * Magic-link callbacks are consumed automatically by the client, so all this
 * has to do is listen for the resulting auth state change.
 */
export default function AuthGate({
  children,
}: {
  children: (session: Session) => React.ReactNode;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
      // Strip ?code=… from the URL once it has been exchanged.
      if (window.location.search.includes('code=')) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="boot">Unlocking the desk…</div>;
  if (!session) return <SignIn />;
  return <>{children(session)}</>;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [message, setMessage] = useState('');

  async function send(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) return;
    setState('sending');
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setState('error');
      setMessage(error.message);
    } else {
      setState('sent');
    }
  }

  return (
    <div className="auth-root">
      <div className="auth-card">
        <div className="kicker">Your Reading Desk</div>
        <h1 className="auth-title">Marginalia</h1>
        <p className="auth-desc">
          Highlight what matters, and pull a blank notebook page alongside the passage
          to think it through. Sign in and your documents and notes follow you to any
          device.
        </p>

        {state === 'sent' ? (
          <div className="auth-sent">
            <strong>Check your email.</strong>
            <span>
              We sent a sign-in link to <em>{email}</em>. Open it on this device and
              you&rsquo;ll land straight back here.
            </span>
            <button className="sample-link" onClick={() => setState('idle')}>
              use a different address
            </button>
          </div>
        ) : (
          <form className="auth-form" onSubmit={send}>
            <label className="auth-label" htmlFor="email">
              Email address
            </label>
            <input
              id="email"
              className="auth-input"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
            <button className="cbtn gold auth-submit" type="submit" disabled={state === 'sending'}>
              {state === 'sending' ? 'Sending…' : 'Send me a sign-in link'}
            </button>
            {state === 'error' && <p className="auth-error">{message}</p>}
            <p className="auth-fine">
              No password required. We email you a one-time link.
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
