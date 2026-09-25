import { useAuth } from "./auth";

function EmptyDashboardSection({
  id,
  title,
  description,
  action,
}: {
  id: string;
  title: string;
  description: string;
  action?: string;
}) {
  return (
    <section className="student-dashboard-section" id={id} aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>{title}</h2>
      <div className="student-empty-state">
        <p>{description}</p>
        {action && (
          <button className="button dashboard-disabled-action" type="button" disabled>
            {action}
          </button>
        )}
      </div>
    </section>
  );
}

export default function StudentDashboard() {
  const { profile } = useAuth();
  const displayName = profile?.display_name?.trim();

  return (
    <div className="student-dashboard">
      <header className="student-dashboard-heading">
        <p className="auth-kicker">STUDENT SPACE</p>
        <h1>{displayName ? `Welcome, ${displayName}.` : "Your learning space."}</h1>
        <p>Courses, assessments and learning feedback will come together here.</p>
      </header>

      <div className="student-dashboard-sections">
        <EmptyDashboardSection
          id="courses"
          title="Courses"
          description="Courses you join will appear here when course membership is available."
          action="Course access is not available yet"
        />
        <EmptyDashboardSection
          id="assessments"
          title="Assessments"
          description="Published assessments from your courses will appear here when assessment access is available."
        />
        <EmptyDashboardSection
          id="results"
          title="Results"
          description="Assessment results and lecturer feedback will appear here after you complete an assessment."
        />
        <EmptyDashboardSection
          id="practice"
          title="Weak areas & practice"
          description="After results identify topics to revisit, related practice will appear here."
          action="Practice is not available yet"
        />
      </div>
    </div>
  );
}