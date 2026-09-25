import type { PropsWithChildren } from "react";
import {
  BrowserRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { AuthProvider, getIdentityDestination, useAuth, type StudiaRole } from "./auth";
import { SignInPage, SignUpPage } from "./AuthPages";
import { AuthenticatedShell } from "./components/AuthenticatedShell";
import StudentDashboard from "./StudentDashboard";
import {
  AccountStatusPage,
  IdentityAreaPage,
  LecturerPendingPage,
  OnboardingPage,
  ProfileResolutionPage,
} from "./IdentityPages";
import Footer from "./components/Footer";
import FinalCTA from "./components/FinalCTA";
import Hero from "./components/Hero";
import IntelligenceSection from "./components/IntelligenceSection";
import LecturerSection from "./components/LecturerSection";
import Navbar from "./components/Navbar";
import ProductLoop from "./components/ProductLoop";
import StudentSection from "./components/StudentSection";

function LandingPage() {
  return (
    <div className="site-shell min-h-screen">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <Navbar />
      <main id="main-content">
        <Hero />
        <ProductLoop />
        <LecturerSection />
        <StudentSection />
        <IntelligenceSection />
        <FinalCTA />
      </main>
      <Footer />
    </div>
  );
}

function AuthLoading() {
  return (
    <main className="auth-page">
      <div className="auth-loading" role="status" aria-live="polite">
        <LoaderCircle aria-hidden="true" size={20} className="auth-spinner" />
        <span>Checking your account access…</span>
      </div>
    </main>
  );
}

function GuestOnly({ children }: PropsWithChildren) {
  const { status } = useAuth();

  if (status === "loading") return <AuthLoading />;
  if (status === "authenticated") return <Navigate to="/app" replace />;
  return children;
}

function PostAuthResolver() {
  const { status, profile, profileResolution, lecturerApplication } = useAuth();
  const location = useLocation();

  if (status === "loading" || (status === "authenticated" && profileResolution === "loading")) {
    return <AuthLoading />;
  }
  if (status === "unauthenticated") {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }
  if (profileResolution === "error" || profileResolution === "missing" || !profile) {
    return <ProfileResolutionPage missing={profileResolution === "missing"} />;
  }
  return <Navigate to={getIdentityDestination(profile, lecturerApplication)} replace />;
}

function IdentityGate({ destination, shellRole, children }: PropsWithChildren<{ destination: string; shellRole?: StudiaRole }>) {
  const { status, profile, profileResolution, lecturerApplication } = useAuth();
  const location = useLocation();

  if (status === "loading" || (status === "authenticated" && profileResolution === "loading")) {
    return <AuthLoading />;
  }
  if (status === "unauthenticated") {
    return <Navigate to="/sign-in" replace state={{ from: location }} />;
  }
  if (profileResolution === "error" || profileResolution === "missing" || !profile) {
    return <ProfileResolutionPage missing={profileResolution === "missing"} />;
  }

  const resolvedDestination = getIdentityDestination(profile, lecturerApplication);
  if (resolvedDestination !== destination) {
    return <Navigate to={resolvedDestination} replace />;
  }
  return shellRole ? <AuthenticatedShell role={shellRole}>{children}</AuthenticatedShell> : children;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/sign-in" element={<GuestOnly><SignInPage /></GuestOnly>} />
          <Route path="/sign-up" element={<GuestOnly><SignUpPage /></GuestOnly>} />
          <Route path="/app" element={<PostAuthResolver />} />
          <Route path="/onboarding" element={<IdentityGate destination="/onboarding"><OnboardingPage /></IdentityGate>} />
          <Route path="/lecturer/pending" element={<IdentityGate destination="/lecturer/pending"><LecturerPendingPage /></IdentityGate>} />
          <Route path="/student" element={<IdentityGate destination="/student" shellRole="student"><StudentDashboard /></IdentityGate>} />
          <Route path="/lecturer" element={<IdentityGate destination="/lecturer" shellRole="lecturer"><IdentityAreaPage role="lecturer" /></IdentityGate>} />
          <Route path="/admin" element={<IdentityGate destination="/admin" shellRole="admin"><IdentityAreaPage role="admin" /></IdentityGate>} />
          <Route path="/account-status" element={<IdentityGate destination="/account-status"><AccountStatusPage /></IdentityGate>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}

