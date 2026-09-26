import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { useAuth } from "./auth";
import { courseAreaRoutes } from "./appNavigation";
import { supabase, supabaseConfigurationError } from "./supabase";

type Course = {
  id: string;
  lecturer_id: string;
  name: string;
  code: string;
  description: string | null;
  created_at: string;
  updated_at: string;
};

const courseFields = "id, lecturer_id, name, code, description, created_at, updated_at";
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function CoursePageHeading({ kicker, title, description }: {
  kicker: string;
  title: string;
  description: string;
}) {
  return (
    <header className="course-page-heading">
      <p className="auth-kicker">{kicker}</p>
      <h1>{title}</h1>
      <p>{description}</p>
    </header>
  );
}

function CourseLink({ course, to }: { course: Course; to: string }) {
  return (
    <li className="course-list-item">
      <Link className="course-list-link" to={to}>
        <span className="course-list-code">{course.code}</span>
        <span className="course-list-copy">
          <strong>{course.name}</strong>
          <span>{course.description?.trim() || "No course description has been added."}</span>
        </span>
        <span className="course-list-date">Created {formatDate(course.created_at)}</span>
      </Link>
    </li>
  );
}

export function LecturerCoursesPage() {
  const { profile } = useAuth();
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [description, setDescription] = useState("");

  const loadCourses = useCallback(async () => {
    if (!supabase) {
      setLoadError(supabaseConfigurationError);
      setCourses([]);
      setLoading(false);
      return;
    }
    if (!profile?.user_id) {
      setLoadError("Your lecturer profile could not be found.");
      setCourses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");
    try {
      const { data, error } = await supabase
        .from("courses")
        .select(courseFields)
        .eq("lecturer_id", profile.user_id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCourses((data ?? []) as unknown as Course[]);
    } catch (error) {
      setLoadError(messageFor(error, "Unable to load your courses."));
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, [profile?.user_id]);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  async function createCourse(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!supabase) {
      setFormError(supabaseConfigurationError);
      return;
    }

    const cleanName = name.trim();
    const cleanCode = code.trim();
    const cleanDescription = description.trim();
    if (!cleanName || !cleanCode) {
      setFormError("Enter a course name and course code.");
      return;
    }
    if (cleanName.length > 160 || cleanCode.length > 50 || cleanDescription.length > 5000) {
      setFormError("Keep the course name under 160 characters, code under 50, and description under 5,000.");
      return;
    }

    setSaving(true);
    setFormError("");
    setNotice("");
    try {
      const { data, error } = await supabase
        .from("courses")
        .insert({
          name: cleanName,
          code: cleanCode,
          description: cleanDescription || null,
        })
        .select(courseFields)
        .single();
      if (error) throw error;
      const created = data as unknown as Course;
      setCourses((current) => [created, ...current.filter((course) => course.id !== created.id)]);
      setName("");
      setCode("");
      setDescription("");
      setFormOpen(false);
      setNotice(created.name + " was created.");
    } catch (error) {
      setFormError(messageFor(error, "Unable to create this course. Please try again."));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="courses-page">
      <CoursePageHeading
        kicker="LECTURER SPACE"
        title="Your courses"
        description="Create and manage the course spaces you own."
      />

      <section className="course-work-section" aria-labelledby="lecturer-courses-title">
        <div className="course-section-heading">
          <div>
            <p className="auth-kicker">COURSE LIST</p>
            <h2 id="lecturer-courses-title">Courses</h2>
          </div>
          <button
            className="button button-primary course-create-toggle"
            type="button"
            onClick={() => {
              setFormOpen((open) => !open);
              setFormError("");
              setNotice("");
            }}
            aria-expanded={formOpen}
            aria-controls="create-course-form"
          >
            {formOpen ? "Close form" : "Create course"}
          </button>
        </div>

        {notice && <p className="course-feedback course-success" role="status">{notice}</p>}

        {formOpen && (
          <form className="course-form" id="create-course-form" onSubmit={(event) => void createCourse(event)}>
            <div className="course-form-fields">
              <label className="auth-field">
                <span>Course name</span>
                <input
                  name="course-name"
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={160}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="auth-field">
                <span>Course code</span>
                <input
                  name="course-code"
                  value={code}
                  onChange={(event) => setCode(event.target.value)}
                  maxLength={50}
                  autoComplete="off"
                  required
                />
              </label>
              <label className="auth-field course-description-field">
                <span>Description <small>(optional)</small></span>
                <textarea
                  name="course-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  maxLength={5000}
                  rows={4}
                />
              </label>
            </div>
            {formError && <p className="auth-error" role="alert">{formError}</p>}
            <div className="course-form-actions">
              <button className="button button-primary" type="submit" disabled={saving}>
                {saving && <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />}
                {saving ? "Creating course..." : "Save course"}
              </button>
            </div>
          </form>
        )}

        {loading ? (
          <p className="course-feedback" role="status">
            <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />
            Loading courses...
          </p>
        ) : loadError ? (
          <div className="course-empty-state">
            <p className="auth-error" role="alert">{loadError}</p>
            <button className="button identity-secondary" type="button" onClick={() => void loadCourses()}>
              Try again
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="course-empty-state">
            <p>You have not created a course yet. Create one to establish its course space.</p>
            {!formOpen && (
              <button className="button identity-secondary" type="button" onClick={() => setFormOpen(true)}>
                Create your first course
              </button>
            )}
          </div>
        ) : (
          <ul className="course-list" aria-label="Courses you own">
            {courses.map((course) => (
              <CourseLink key={course.id} course={course} to={`/lecturer/courses/${course.id}`} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

export function StudentCoursesPage() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");

  const loadCourses = useCallback(async () => {
    if (!supabase) {
      setLoadError(supabaseConfigurationError);
      setCourses([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setLoadError("");
    try {
      const { data, error } = await supabase
        .from("courses")
        .select(courseFields)
        .order("created_at", { ascending: false });
      if (error) throw error;
      setCourses((data ?? []) as unknown as Course[]);
    } catch (error) {
      setLoadError(messageFor(error, "Unable to load your enrolled courses."));
      setCourses([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCourses();
  }, [loadCourses]);

  return (
    <div className="courses-page">
      <CoursePageHeading
        kicker="STUDENT SPACE"
        title="Your courses"
        description="Courses you are enrolled in are gathered here."
      />

      <section className="course-work-section" aria-labelledby="student-courses-title">
        <div className="course-section-heading">
          <div>
            <p className="auth-kicker">COURSE LIST</p>
            <h2 id="student-courses-title">Enrolled courses</h2>
          </div>
        </div>

        {loading ? (
          <p className="course-feedback" role="status">
            <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />
            Loading enrolled courses...
          </p>
        ) : loadError ? (
          <div className="course-empty-state">
            <p className="auth-error" role="alert">{loadError}</p>
            <button className="button identity-secondary" type="button" onClick={() => void loadCourses()}>
              Try again
            </button>
          </div>
        ) : courses.length === 0 ? (
          <div className="course-empty-state">
            <p>You are not enrolled in any courses yet. Courses will appear here once a trusted course administrator associates your account with one.</p>
          </div>
        ) : (
          <ul className="course-list" aria-label="Your enrolled courses">
            {courses.map((course) => (
              <CourseLink key={course.id} course={course} to={`/student/courses/${course.id}`} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CourseDetailPage({ audience }: { audience: "student" | "lecturer" }) {
  const { courseId } = useParams();
  const { profile } = useAuth();
  const [course, setCourse] = useState<Course | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const listPath = audience === "student" ? courseAreaRoutes.student.list : courseAreaRoutes.lecturer.list;

  useEffect(() => {
    let cancelled = false;
    const client = supabase;
    if (!client) {
      setLoadError(supabaseConfigurationError);
      setCourse(null);
      setLoading(false);
      return () => { cancelled = true; };
    }
    if (!courseId || !uuidPattern.test(courseId)) {
      setCourse(null);
      setLoadError("");
      setLoading(false);
      return () => { cancelled = true; };
    }

    async function loadCourse(courseClient: NonNullable<typeof supabase>) {
      setLoading(true);
      setLoadError("");
      try {
        const { data, error } = await courseClient
          .from("courses")
          .select(courseFields)
          .eq("id", courseId)
          .maybeSingle();
        if (error) throw error;
        if (!cancelled) setCourse(data as unknown as Course | null);
      } catch (error) {
        if (!cancelled) {
          setCourse(null);
          setLoadError(messageFor(error, "Unable to load this course."));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadCourse(client);
    return () => { cancelled = true; };
  }, [courseId]);

  if (loading) {
    return (
      <div className="course-feedback" role="status">
        <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />
        Loading course...
      </div>
    );
  }

  if (loadError) {
    return (
      <div className="courses-page">
        <CoursePageHeading
          kicker={audience === "student" ? "STUDENT SPACE" : "LECTURER SPACE"}
          title="Course unavailable"
          description={loadError}
        />
        <Link className="button identity-secondary course-back-link" to={listPath}>Back to courses</Link>
      </div>
    );
  }

  if (!course) {
    return (
      <div className="courses-page">
        <CoursePageHeading
          kicker={audience === "student" ? "STUDENT SPACE" : "LECTURER SPACE"}
          title="Course unavailable"
          description="This course is not available to this account, or it may no longer exist."
        />
        <Link className="button identity-secondary course-back-link" to={listPath}>Back to courses</Link>
      </div>
    );
  }

  const ownerContext = audience === "lecturer"
    ? `Owned by ${profile?.display_name?.trim() || "your approved lecturer account"}.`
    : "This course is part of your enrolled course list.";

  return (
    <div className="courses-page course-detail-page">
      <Link className="course-back-link" to={listPath}>Back to courses</Link>
      <CoursePageHeading
        kicker={audience === "student" ? "STUDENT COURSE" : "LECTURER COURSE"}
        title={course.name}
        description={course.description?.trim() || "No course description has been added."}
      />

      <section className="course-detail-section" aria-labelledby="course-information-title">
        <p className="auth-kicker">COURSE INFORMATION</p>
        <h2 id="course-information-title">Course details</h2>
        <dl className="course-facts">
          <div>
            <dt>Course code</dt>
            <dd>{course.code}</dd>
          </div>
          <div>
            <dt>Course access</dt>
            <dd>{ownerContext}</dd>
          </div>
          <div>
            <dt>Created</dt>
            <dd>{formatDate(course.created_at)}</dd>
          </div>
        </dl>
      </section>

      <section className="course-detail-section course-materials-empty" aria-labelledby="course-materials-title">
        <p className="auth-kicker">COURSE MATERIALS</p>
        <h2 id="course-materials-title">Materials will appear here later.</h2>
        <p>
          {audience === "lecturer"
            ? "Course materials and Course Brain preparation are not available yet."
            : "Your lecturer has not added course materials here yet. Course learning support will be introduced in a later Studia step."}
        </p>
      </section>
    </div>
  );
}

export function LecturerCourseDetailPage() {
  return <CourseDetailPage audience="lecturer" />;
}

export function StudentCourseDetailPage() {
  return <CourseDetailPage audience="student" />;
}
