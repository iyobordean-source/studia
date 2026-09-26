import { useEffect, useState, type PropsWithChildren } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useAuth, type StudiaRole } from "../auth";
import { roleLabels, roleNavigation } from "../appNavigation";
import { supabase, supabaseConfigurationError } from "../supabase";

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
    <div className="identity-actions app-signout">
      <button className="button button-primary" type="button" onClick={signOut} disabled={pending}>
        {pending && <LoaderCircle aria-hidden="true" size={15} className="auth-spinner" />}
        {pending ? "Signing out…" : "Sign out"}
      </button>
      {error && <p className="auth-error" role="alert">{error}</p>}
    </div>
  );
}

export function AuthenticatedShell({
  role,
  children,
}: PropsWithChildren<{ role: StudiaRole }>) {
  const { profile, session } = useAuth();
  const location = useLocation();
  const displayName = profile?.display_name?.trim() || "Studia account";
  const accountEmail = session?.user.email || "Authenticated account";

  useEffect(() => {
    const sectionId = location.hash.slice(1);
    if (sectionId) document.getElementById(sectionId)?.scrollIntoView({ block: "start" });
  }, [location.hash, location.pathname]);

  return (
    <div className="authenticated-shell">
      <a className="skip-link" href="#app-main">Skip to main content</a>
      <aside className="app-sidebar">
        <Link className="wordmark app-brand" to="/" aria-label="Studia home">
          <span>Stud</span><span className="wordmark-accent">ia</span>
        </Link>
        <p className="app-brand-caption">COURSE & LEARNING SPACE</p>
        <nav className="app-navigation" aria-label={`${roleLabels[role]} navigation`}>
          {roleNavigation[role].map((item) => {
            const active = item.section
              ? location.pathname === `/${role}` && location.hash === `#${item.section}`
              : (location.pathname === item.to && (!location.hash || item.to !== `/${role}`))
                || location.pathname.startsWith(`${item.to}/`);
            return (
              <Link
                className={`app-navigation-link${active ? " is-active" : ""}`}
                to={item.to}
                key={item.to}
                aria-current={active ? (item.section ? "location" : "page") : undefined}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className="app-sidebar-context">
          <span>Signed in as</span>
          <strong>{roleLabels[role]}</strong>
        </div>
      </aside>

      <div className="app-workspace">
        <header className="app-topbar">
          <p className="app-workspace-label">{roleLabels[role]}</p>
          <div className="app-account-context">
            <div className="app-account-copy">
              <span>{displayName}</span>
              <small>{accountEmail}</small>
            </div>
            <SignOutButton />
          </div>
        </header>
        <main className="app-main" id="app-main" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  );
}