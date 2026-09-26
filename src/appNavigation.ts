import type { StudiaRole } from "./auth";

export type NavigationItem = {
  label: string;
  to: string;
  section?: string;
};

export const courseAreaRoutes = {
  student: {
    list: "/student/courses",
    detail: "/student/courses/:courseId",
    identityDestination: "/student",
  },
  lecturer: {
    list: "/lecturer/courses",
    detail: "/lecturer/courses/:courseId",
    identityDestination: "/lecturer",
  },
} as const;

export const roleLabels: Record<StudiaRole, string> = {
  student: "Student workspace",
  lecturer: "Lecturer workspace",
  admin: "Administration",
};

export const roleNavigation: Record<StudiaRole, NavigationItem[]> = {
  student: [
    { label: "Overview", to: "/student" },
    { label: "Courses", to: courseAreaRoutes.student.list },
    { label: "Assessments", to: "/student#assessments", section: "assessments" },
    { label: "Results", to: "/student#results", section: "results" },
    { label: "Weak areas & practice", to: "/student#practice", section: "practice" },
  ],
  lecturer: [
    { label: "Lecturer area", to: "/lecturer" },
    { label: "Courses", to: courseAreaRoutes.lecturer.list },
  ],
  admin: [{ label: "Lecturer applications", to: "/admin" }],
};
