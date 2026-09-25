import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type PropsWithChildren,
} from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";

export type StudiaRole = "student" | "lecturer" | "admin";
export type AccountStatus = "onboarding" | "active" | "pending" | "rejected" | "disabled";
export type LecturerApplicationStatus = "pending" | "approved" | "rejected";
export type AuthStatus = "loading" | "authenticated" | "unauthenticated";
export type ProfileResolution = "loading" | "ready" | "missing" | "error";

export type UserProfile = {
  user_id: string;
  display_name: string | null;
  role: StudiaRole;
  account_status: AccountStatus;
  created_at: string;
  updated_at: string;
};

export type LecturerApplication = {
  id: string;
  user_id: string;
  status: LecturerApplicationStatus;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
};

type AuthContextValue = {
  status: AuthStatus;
  session: Session | null;
  profile: UserProfile | null;
  profileResolution: ProfileResolution;
  profileError: string;
  lecturerApplication: LecturerApplication | null;
  refreshProfile: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function getIdentityDestination(
  profile: UserProfile,
  application: LecturerApplication | null,
) {
  if (profile.account_status === "onboarding") return "/onboarding";
  if (profile.account_status === "rejected" || profile.account_status === "disabled") {
    return "/account-status";
  }
  if (
    profile.role === "lecturer" &&
    profile.account_status === "pending" &&
    application?.status === "pending"
  ) return "/lecturer/pending";
  if (profile.role === "student" && profile.account_status === "active") return "/student";
  if (
    profile.role === "lecturer" &&
    profile.account_status === "active" &&
    application?.status === "approved"
  ) return "/lecturer";
  if (profile.role === "admin" && profile.account_status === "active") return "/admin";
  return "/account-status";
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<AuthStatus>(supabase ? "loading" : "unauthenticated");
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [profileResolution, setProfileResolution] = useState<ProfileResolution>(supabase ? "loading" : "ready");
  const [profileError, setProfileError] = useState("");
  const [lecturerApplication, setLecturerApplication] = useState<LecturerApplication | null>(null);
  const requestId = useRef(0);

  const resolveSession = useCallback(async (currentSession: Session | null) => {
    const currentRequest = ++requestId.current;
    setSession(currentSession);
    setProfile(null);
    setLecturerApplication(null);
    setProfileError("");

    if (!supabase || !currentSession) {
      setStatus("unauthenticated");
      setProfileResolution("ready");
      return;
    }

    setStatus("loading");
    setProfileResolution("loading");

    try {
      let { data, error } = await supabase
        .from("profiles")
        .select("user_id, display_name, role, account_status, created_at, updated_at")
        .eq("user_id", currentSession.user.id)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        const { error: ensureError } = await supabase.rpc("ensure_my_profile");
        if (ensureError) throw ensureError;
        const result = await supabase
          .from("profiles")
          .select("user_id, display_name, role, account_status, created_at, updated_at")
          .eq("user_id", currentSession.user.id)
          .maybeSingle();
        data = result.data;
        if (result.error) throw result.error;
      }

      if (currentRequest !== requestId.current) return;
      if (!data) {
        setStatus("authenticated");
        setProfileResolution("missing");
        return;
      }

      const resolvedProfile = data as unknown as UserProfile;
      let resolvedApplication: LecturerApplication | null = null;
      if (resolvedProfile.role === "lecturer") {
        const { data: applicationData, error: applicationError } = await supabase
          .from("lecturer_applications")
          .select("id, user_id, status, submitted_at, reviewed_at, reviewed_by")
          .eq("user_id", currentSession.user.id)
          .maybeSingle();
        if (applicationError) throw applicationError;
        resolvedApplication = applicationData as unknown as LecturerApplication | null;
      }

      if (currentRequest !== requestId.current) return;
      setProfile(resolvedProfile);
      setLecturerApplication(resolvedApplication);
      setStatus("authenticated");
      setProfileResolution("ready");
    } catch (error) {
      if (currentRequest !== requestId.current) return;
      setStatus("authenticated");
      setProfileResolution("error");
      setProfileError(error instanceof Error ? error.message : "Unable to resolve account access.");
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    await resolveSession(session);
  }, [resolveSession, session]);

  useEffect(() => {
    if (!supabase) {
      setStatus("unauthenticated");
      setProfileResolution("ready");
      return;
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      // Defer data queries until Supabase has released the auth event lock.
      window.setTimeout(() => { void resolveSession(currentSession); }, 0);
    });

    return () => {
      requestId.current += 1;
      subscription.unsubscribe();
    };
  }, [resolveSession]);

  return (
    <AuthContext.Provider value={{
      status,
      session,
      profile,
      profileResolution,
      profileError,
      lecturerApplication,
      refreshProfile,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}


