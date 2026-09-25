import { useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowRight, Check, LoaderCircle } from "lucide-react";
import { supabase, supabaseConfigurationError } from "./supabase";

type AuthLayoutProps = {
  title: string;
  description: string;
  switchPrompt: string;
  switchLabel: string;
  switchTo: string;
  children: ReactNode;
};

function AuthLayout({
  title,
  description,
  switchPrompt,
  switchLabel,
  switchTo,
  children,
}: AuthLayoutProps) {
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Link className="wordmark auth-wordmark" to="/" aria-label="Studia home">
          <span>Stud</span><span className="wordmark-accent">ia</span>
        </Link>
        <Link className="auth-home-link" to="/">Back to home</Link>
      </header>
      <main className="auth-main">
        <div className="auth-intro">
          <p className="auth-kicker">ACCOUNT ACCESS</p>
          <h1>{title}</h1>
          <p className="auth-description">{description}</p>
        </div>
        <section className="auth-form-panel" aria-label={title}>
          {children}
        </section>
        <p className="auth-switch">
          {switchPrompt} <Link to={switchTo}>{switchLabel}</Link>
        </p>
      </main>
      <footer className="auth-page-footer">Course knowledge, carried forward.</footer>
    </div>
  );
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return "Something went wrong. Please try again.";
}

function useGoogleOAuth(setError: (message: string) => void) {
  const [pending, setPending] = useState(false);

  async function continueWithGoogle() {
    setError("");

    if (!supabase) {
      setError(supabaseConfigurationError);
      return;
    }

    setPending(true);
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/app`,
        },
      });

      if (oauthError) setError(oauthError.message);
    } catch (oauthError) {
      setError(getErrorMessage(oauthError));
    } finally {
      setPending(false);
    }
  }

  return { pending, continueWithGoogle };
}

function GoogleMark() {
  return (
    <svg aria-hidden="true" focusable="false" viewBox="0 0 48 48" width="18" height="18">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.72 7.18l7.68 5.95c4.48-4.14 7.08-10.25 7.08-17.6z" />
      <path fill="#FBBC05" d="M10.53 28.59a14.4 14.4 0 0 1 0-9.18l-7.98-6.19a24 24 0 0 0 0 21.56l7.98-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.92-2.13 15.89-5.8l-7.68-5.95c-2.13 1.43-4.85 2.27-8.21 2.27-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

function GoogleAuthButton({ pending, onClick }: { pending: boolean; onClick: () => void }) {
  return (
    <button
      className="google-auth-button"
      type="button"
      onClick={onClick}
      disabled={pending}
      aria-busy={pending}
    >
      <GoogleMark />
      <span>{pending ? "Connecting to Googleâ€¦" : "Continue with Google"}</span>
      {pending && <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />}
    </button>
  );
}

export function SignInPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const googleOAuth = useGoogleOAuth(setError);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (!supabase) {
      setError(supabaseConfigurationError);
      return;
    }

    setPending(true);
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError) {
        setError(
          signInError.message.toLowerCase().includes("invalid login credentials")
            ? "Email or password is incorrect. Check your details and try again."
            : signInError.message,
        );
        return;
      }

      navigate("/app", { replace: true });
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout
      title="Welcome back."
      description="Sign in to continue to your courses and learning."
      switchPrompt="New to Studia?"
      switchLabel="Create an account"
      switchTo="/sign-up"
    >
      <form className="auth-form" onSubmit={handleSubmit}>
        <label className="auth-field">
          <span>Email</span>
          <input
            type="email"
            name="email"
            autoComplete="email"
            autoCapitalize="none"
            spellCheck={false}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
          />
        </label>
        <label className="auth-field">
          <span>Password</span>
          <input
            type="password"
            name="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
          />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <button className="button button-primary auth-submit" type="submit" disabled={pending || googleOAuth.pending}>
          {pending ? <LoaderCircle aria-hidden="true" size={17} className="auth-spinner" /> : null}
          {pending ? "Signing inâ€¦" : "Sign in"}
          {!pending && <ArrowRight aria-hidden="true" size={16} strokeWidth={1.8} />}
        </button>
      </form>
      <div className="auth-divider"><span>or</span></div>
      <GoogleAuthButton pending={googleOAuth.pending} onClick={googleOAuth.continueWithGoogle} />
    </AuthLayout>
  );
}

export function SignUpPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [confirmationSent, setConfirmationSent] = useState(false);
  const googleOAuth = useGoogleOAuth(setError);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    if (!supabase) {
      setError(supabaseConfigurationError);
      return;
    }

    setPending(true);
    try {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: {
          emailRedirectTo: `${window.location.origin}/app`,
        },
      });

      if (signUpError) {
        setError(signUpError.message);
        return;
      }

      if (data.session) {
        navigate("/app", { replace: true });
      } else {
        setConfirmationSent(true);
      }
    } catch (submitError) {
      setError(getErrorMessage(submitError));
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthLayout
      title="Create your account."
      description="Create your account, then choose a student account or apply for lecturer access."
      switchPrompt="Already have an account?"
      switchLabel="Sign in"
      switchTo="/sign-in"
    >
      {confirmationSent ? (
        <div className="auth-confirmation" role="status" aria-live="polite">
          <span className="auth-confirmation-icon"><Check aria-hidden="true" size={18} /></span>
          <h2>Check your email.</h2>
          <p>
            We sent a confirmation link to <strong>{email.trim()}</strong>. Confirm your
            address to finish creating your account.
          </p>
          <Link className="auth-secondary-link" to="/sign-in">Return to sign in</Link>
        </div>
      ) : (
        <form className="auth-form" onSubmit={handleSubmit}>
          <label className="auth-field">
            <span>Email</span>
            <input
              type="email"
              name="email"
              autoComplete="email"
              autoCapitalize="none"
              spellCheck={false}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="auth-field">
            <span>Password</span>
            <input
              type="password"
              name="password"
              autoComplete="new-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
          </label>
          <label className="auth-field">
            <span>Confirm password</span>
            <input
              type="password"
              name="confirm-password"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              required
            />
          </label>
          {error && <p className="auth-error" role="alert">{error}</p>}
          <button className="button button-primary auth-submit" type="submit" disabled={pending || googleOAuth.pending}>
            {pending ? <LoaderCircle aria-hidden="true" size={17} className="auth-spinner" /> : null}
            {pending ? "Creating accountâ€¦" : "Create account"}
            {!pending && <ArrowRight aria-hidden="true" size={16} strokeWidth={1.8} />}
          </button>
        </form>
      )}
      {!confirmationSent && (
        <>
          <div className="auth-divider"><span>or</span></div>
          <GoogleAuthButton pending={googleOAuth.pending} onClick={googleOAuth.continueWithGoogle} />
        </>
      )}
    </AuthLayout>
  );
}

