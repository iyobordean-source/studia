export type IdentityProfile = {
  role: "student" | "lecturer" | "admin";
  account_status: "onboarding" | "active" | "pending" | "rejected" | "disabled";
};

export type IdentityApplication = {
  status: "pending" | "approved" | "rejected";
};

export function getIdentityDestination(
  profile: IdentityProfile,
  application: IdentityApplication | null,
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