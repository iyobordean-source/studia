import { useState, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useAuth, type StudiaRole } from "./auth";
import { supabase, supabaseConfigurationError } from "./supabase";

function IdentityShell({
  kicker,
  title,
  description,
  children,
}: {
  kicker: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  return (
    <div className="auth-page">
      <header className="auth-header">
        <Link className="wordmark auth-wordmark" to="/" aria-label="Studia home">
          <span>Stud</span><span className="wordmark-accent">ia</span>
        </Link>
        <Link className="auth-home-link" to="/">Back to home</Link>
      </header>
      <main className="app-placeholder">
        <p className="auth-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p className="auth-description identity-description">{description}</p>
        {children}
      </main>
      <footer className="auth-page-footer">Course knowledge, carried forward.</footer>
    </div>
  );
}

export function SignOutButton() {
  const navigate = useNavigate();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function signOut() {
    if (!supabase) {
      setError(supabaseConfigurationError);
      return;
    }
    setPending(true);
    setError("");
    try {
      const { error: signOutError } = await supabase.auth.signOut();
      if (signOutError) {
        setError(signOutError.message);
        return;
      }
      navigate("/sign-in", { replace: true });
    } catch (signOutError) {
      setError(signOutError instanceof Error ? signOutError.message : "Unable to sign out. Please try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="identity-actions">
      <button className="button button-primary" type="button" onClick={signOut} disabled={pending}>
        {pending && <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />}
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}

export function OnboardingPage() {
  const navigate = useNavigate();
  const { profile, refreshProfile } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.display_name ?? "");
  const [pendingRole, setPendingRole] = useState<"student" | "lecturer" | null>(null);
  const [error, setError] = useState("");

  async function completeOnboarding(role: Exclude<StudiaRole, "admin">) {
    if (!supabase) {
      setError(supabaseConfigurationError);
      return;
    }
    if (!displayName.trim()) {
      setError("Enter your name to continue.");
      return;
    }

    setPendingRole(role);
    setError("");
    try {
      const { error: onboardingError } = await supabase.rpc("complete_my_onboarding", {
        p_role: role,
        p_display_name: displayName.trim(),
      });
      if (onboardingError) {
        setError(onboardingError.message);
        return;
      }
      await refreshProfile();
      navigate("/app", { replace: true });
    } catch (onboardingError) {
      setError(onboardingError instanceof Error ? onboardingError.message : "Unable to complete account setup.");
    } finally {
      setPendingRole(null);
    }
  }

  return (
    <IdentityShell
      kicker="ACCOUNT SETUP"
      title="How will you use Studia?"
      description="Choose your account path. Lecturer access is reviewed before it is granted."
    >
      <div className="identity-form">
        <label className="auth-field">
          <span>Display name</span>
          <input
            type="text"
            name="display-name"
            autoComplete="name"
            maxLength={120}
            value={displayName}
            onChange={(event) => setDisplayName(event.target.value)}
            required
          />
        </label>
        {error && <p className="auth-error" role="alert">{error}</p>}
        <div className="onboarding-options" role="group" aria-label="Choose an account path">
          <button
            className="button button-primary"
            type="button"
            onClick={() => void completeOnboarding("student")}
            disabled={pendingRole !== null}
          >
            {pendingRole === "student" && <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />}
            {pendingRole === "student" ? "Setting up student account…" : "Continue as a student"}
          </button>
          <button
            className="button identity-secondary"
            type="button"
            onClick={() => void completeOnboarding("lecturer")}
            disabled={pendingRole !== null}
          >
            {pendingRole === "lecturer" && <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />}
            {pendingRole === "lecturer" ? "Submitting application…" : "Apply as a lecturer"}
          </button>
        </div>
        <p className="identity-note">Applying as a lecturer creates a pending application. It does not grant lecturer access.</p>
        <SignOutButton />
      </div>
    </IdentityShell>
  );
}

export function LecturerPendingPage() {
  const { refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);

  async function refreshStatus() {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  }

  return (
    <IdentityShell
      kicker="LECTURER APPLICATION"
      title="Application received."
      description="Your application is pending review. Lecturer tools remain unavailable until an administrator approves it."
    >
      <div className="identity-actions">
        <button className="button button-primary" type="button" onClick={() => void refreshStatus()} disabled={checking}>
          {checking && <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />}
          {checking ? "Checking status…" : "Check application status"}
        </button>
        <SignOutButton />
      </div>
    </IdentityShell>
  );
}

export function AccountStatusPage() {
  const { profile, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);
  const rejected = profile?.account_status === "rejected";
  const disabled = profile?.account_status === "disabled";

  async function refreshStatus() {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  }

  return (
    <IdentityShell
      kicker="ACCOUNT STATUS"
      title={rejected ? "Application not approved." : disabled ? "Account unavailable." : "Access is restricted."}
      description={rejected
        ? "Your lecturer application was not approved. This account does not have lecturer access."
        : "This account does not currently have access to a Studia product area. Contact your institution administrator if you think this is a mistake."}
    >
      <div className="identity-actions">
        <button className="button button-primary" type="button" onClick={() => void refreshStatus()} disabled={checking}>
          {checking && <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />}
          {checking ? "Checking status…" : "Refresh access status"}
        </button>
        <SignOutButton />
      </div>
    </IdentityShell>
  );
}

export function ProfileResolutionPage({ missing = false }: { missing?: boolean }) {
  const { profileError, refreshProfile } = useAuth();
  const [checking, setChecking] = useState(false);

  async function retry() {
    setChecking(true);
    await refreshProfile();
    setChecking(false);
  }

  return (
    <IdentityShell
      kicker="ACCOUNT ACCESS"
      title={missing ? "Account setup is incomplete." : "We couldn’t verify access."}
      description={missing
        ? "No Studia profile is available for this account. Retry profile setup; protected areas stay unavailable until it is resolved."
        : "Studia could not verify your profile and access status. Protected areas stay unavailable until this check succeeds."}
    >
      <div className="identity-actions">
        <button className="button button-primary" type="button" onClick={() => void retry()} disabled={checking}>
          {checking && <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />}
          {checking ? "Checking profile…" : "Retry profile check"}
        </button>
        <SignOutButton />
        {profileError && <span className="sr-only">{profileError}</span>}
      </div>
    </IdentityShell>
  );
}

export function IdentityAreaPage({ role }: { role: "student" | "lecturer" | "admin" }) {
  const title = role === "admin" ? "Administrator area" : role === "lecturer" ? "Lecturer area" : "Student area";
  const description = role === "admin"
    ? "Administrator access is active. The approval tools will be added in a later slice."
    : role === "lecturer"
      ? "Your lecturer access is approved. Course tools will be added in a later slice."
      : "Your student account is active. Course access will appear here when course membership is available.";

  return (
    <IdentityShell kicker={role.toUpperCase()} title={title} description={description}>
      <SignOutButton />
    </IdentityShell>
  );
}


