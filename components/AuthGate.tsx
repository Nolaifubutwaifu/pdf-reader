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
  const [callbackError, setCallbackError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const hadCode = params.has('code');
    const errText = params.get('error_description') ?? hash.get('error_description');

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);

      if (errText) {
        setCallbackError(errText);
      } else if (hadCode && !data.session) {
        // The link was opened somewhere other than the browser that asked for
        // it, so the PKCE verifier is missing and the code cannot be redeemed.
        setCallbackError(
          'That sign-in link could not be completed here. Links only work in the ' +
            'same browser that requested them — ask for a new one below.',
        );
      }
      // Clean the callback params out of the address bar either way.
      if (hadCode || errText) {
        window.history.replaceState({}, '', window.location.pathname);
      }
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      if (s) setCallbackError('');
    });
    return () => sub.subscription.unsubscribe();
  }, []);

  if (!ready) return <div className="boot">Unlocking the desk…</div>;
  if (!session) return <SignIn callbackError={callbackError} />;
  return <>{children(session)}</>;
}

function SignIn({ callbackError }: { callbackError?: string }) {
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
            {callbackError && <p className="auth-error">{callbackError}</p>}
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
