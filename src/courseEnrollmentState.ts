export type CourseJoinAction = "enrolled" | "pending" | "request";

export function getCourseJoinAction(
  isEnrolled: boolean,
  requestStatus: string | null,
): CourseJoinAction {
  if (isEnrolled) return "enrolled";
  if (requestStatus === "pending") return "pending";
  return "request";
}