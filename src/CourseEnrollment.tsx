import { useCallback, useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { LoaderCircle } from "lucide-react";
import { getCourseJoinAction } from "./courseEnrollmentState";
import { supabase, supabaseConfigurationError } from "./supabase";

type EnrolledStudent = {
  student_id: string;
  display_name: string | null;
  email: string | null;
  joined_at: string;
};

type StudentCandidate = {
  student_id: string;
  display_name: string | null;
  email: string | null;
  already_enrolled: boolean;
};

type JoinRequest = {
  request_id: string;
  student_id: string;
  display_name: string | null;
  email: string | null;
  status: "pending";
  submitted_at: string;
};

type CourseMatch = {
  course_id: string;
  course_name: string;
  course_code: string;
  description: string | null;
  is_enrolled: boolean;
  request_status: "pending" | "approved" | "rejected" | null;
  request_created_at: string | null;
};

type StudentRequest = {
  course_id: string;
  course_name: string;
  course_code: string;
  status: "pending" | "approved" | "rejected";
  submitted_at: string;
  is_enrolled: boolean;
};

function messageFor(error: unknown, fallback: string) {
  return error instanceof Error && error.message.trim() ? error.message : fallback;
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(date);
}

function personName(name: string | null, email: string | null) {
  return name?.trim() || email || "Student account";
}

function SectionHeading({ kicker, title, id }: { kicker: string; title: string; id: string }) {
  return (
    <div className="course-section-heading">
      <div>
        <p className="auth-kicker">{kicker}</p>
        <h2 id={id}>{title}</h2>
      </div>
    </div>
  );
}

export function LecturerCourseEnrollment({ courseId }: { courseId: string }) {
  const [students, setStudents] = useState<EnrolledStudent[]>([]);
  const [studentsLoading, setStudentsLoading] = useState(true);
  const [studentsError, setStudentsError] = useState("");
  const [studentQuery, setStudentQuery] = useState("");
  const [candidates, setCandidates] = useState<StudentCandidate[]>([]);
  const [searchingStudents, setSearchingStudents] = useState(false);
  const [hasSearchedStudents, setHasSearchedStudents] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState("");
  const [busyStudentId, setBusyStudentId] = useState("");
  const [busyRequestId, setBusyRequestId] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStudents = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setStudentsError(supabaseConfigurationError);
      setStudents([]);
      setStudentsLoading(false);
      return;
    }

    setStudentsLoading(true);
    setStudentsError("");
    try {
      const { data, error } = await client.rpc("list_course_students", { p_course_id: courseId });
      if (error) throw error;
      setStudents((data ?? []) as unknown as EnrolledStudent[]);
    } catch (error) {
      setStudentsError(messageFor(error, "Unable to load enrolled students."));
      setStudents([]);
    } finally {
      setStudentsLoading(false);
    }
  }, [courseId]);

  const loadRequests = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setRequestsError(supabaseConfigurationError);
      setRequests([]);
      setRequestsLoading(false);
      return;
    }

    setRequestsLoading(true);
    setRequestsError("");
    try {
      const { data, error } = await client.rpc("list_course_join_requests", { p_course_id: courseId });
      if (error) throw error;
      setRequests((data ?? []) as unknown as JoinRequest[]);
    } catch (error) {
      setRequestsError(messageFor(error, "Unable to load join requests."));
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, [courseId]);

  useEffect(() => {
    void Promise.all([loadStudents(), loadRequests()]);
  }, [loadStudents, loadRequests]);

  async function runStudentSearch(query: string) {
    const client = supabase;
    if (!client) {
      setSearchError(supabaseConfigurationError);
      setCandidates([]);
      return;
    }

    setHasSearchedStudents(true);
    setSearchingStudents(true);
    setSearchError("");
    setActionError("");
    try {
      const { data, error } = await client.rpc("search_students_for_course", {
        p_course_id: courseId,
        p_query: query,
      });
      if (error) throw error;
      setCandidates((data ?? []) as unknown as StudentCandidate[]);
    } catch (error) {
      setSearchError(messageFor(error, "Unable to search student accounts."));
      setCandidates([]);
    } finally {
      setSearchingStudents(false);
    }
  }

  async function searchStudents(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const query = studentQuery.trim();
    if (query.length < 2) {
      setSearchError("Enter at least two characters to search.");
      setCandidates([]);
      return;
    }
    await runStudentSearch(query);
  }

  async function addStudent(student: StudentCandidate) {
    const client = supabase;
    if (!client) {
      setActionError(supabaseConfigurationError);
      return;
    }

    setBusyStudentId(student.student_id);
    setActionError("");
    setNotice("");
    try {
      const { data, error } = await client.rpc("add_course_student", {
        p_course_id: courseId,
        p_student_id: student.student_id,
      });
      if (error) throw error;
      setNotice(data
        ? personName(student.display_name, student.email) + " was added to the course."
        : personName(student.display_name, student.email) + " is already enrolled.");
      await Promise.all([loadStudents(), loadRequests()]);
      await runStudentSearch(studentQuery.trim());
    } catch (error) {
      setActionError(messageFor(error, "Unable to add this student."));
    } finally {
      setBusyStudentId("");
    }
  }

  async function removeStudent(student: EnrolledStudent) {
    const client = supabase;
    if (!client) {
      setActionError(supabaseConfigurationError);
      return;
    }

    setBusyStudentId(student.student_id);
    setActionError("");
    setNotice("");
    try {
      const { data, error } = await client.rpc("remove_course_student", {
        p_course_id: courseId,
        p_student_id: student.student_id,
      });
      if (error) throw error;
      setNotice(data
        ? personName(student.display_name, student.email) + " was removed from the course."
        : "This student was no longer enrolled.");
      await loadStudents();
    } catch (error) {
      setActionError(messageFor(error, "Unable to remove this student."));
    } finally {
      setBusyStudentId("");
    }
  }

  async function reviewRequest(request: JoinRequest, decision: "approved" | "rejected") {
    const client = supabase;
    if (!client) {
      setActionError(supabaseConfigurationError);
      return;
    }

    setBusyRequestId(request.request_id);
    setActionError("");
    setNotice("");
    try {
      const { error } = await client.rpc("review_course_join_request", {
        p_request_id: request.request_id,
        p_decision: decision,
      });
      if (error) throw error;
      setNotice(decision === "approved"
        ? personName(request.display_name, request.email) + " was accepted and enrolled."
        : personName(request.display_name, request.email) + "'s request was declined.");
      await Promise.all([loadStudents(), loadRequests()]);
    } catch (error) {
      setActionError(messageFor(error, "Unable to review this request."));
    } finally {
      setBusyRequestId("");
    }
  }

  return (
    <div className="course-enrollment">
      {notice && <p className="course-success" role="status">{notice}</p>}
      {actionError && <p className="course-enrollment-error" role="alert">{actionError}</p>}

      <section className="course-detail-section" aria-labelledby="course-students-title">
        <SectionHeading kicker="COURSE MEMBERS" title="Enrolled students" id="course-students-title" />
        {studentsLoading ? (
          <p className="course-feedback" role="status"><LoaderCircle aria-hidden="true" size={16} className="auth-spinner" /> Loading enrolled students...</p>
        ) : studentsError ? (
          <div className="course-empty-state">
            <p className="auth-error" role="alert">{studentsError}</p>
            <button className="button identity-secondary" type="button" onClick={() => void loadStudents()}>Try again</button>
          </div>
        ) : students.length === 0 ? (
          <p className="course-empty-state">No students are enrolled in this course yet.</p>
        ) : (
          <ul className="course-enrollment-list" aria-label="Enrolled students">
            {students.map((student) => (
              <li className="course-enrollment-row" key={student.student_id}>
                <span className="course-enrollment-person">
                  <strong>{personName(student.display_name, student.email)}</strong>
                  <span>{student.email || "Email unavailable"} · Joined {formatDate(student.joined_at)}</span>
                </span>
                <button
                  className="button identity-secondary course-enrollment-action"
                  type="button"
                  onClick={() => void removeStudent(student)}
                  disabled={Boolean(busyStudentId)}
                  aria-label={"Remove " + personName(student.display_name, student.email) + " from this course"}
                >
                  {busyStudentId === student.student_id ? "Removing..." : "Remove"}
                </button>
              </li>
            ))}
          </ul>
        )}

        <div className="course-enrollment-search">
          <h3>Add a student</h3>
          <p>Search active Student accounts by name or email. Only you, as this course’s lecturer, can see these matches.</p>
          <form className="course-enrollment-search-form" onSubmit={(event) => void searchStudents(event)}>
            <label className="auth-field" htmlFor="course-student-search">
              <span>Student name or email</span>
              <input
                id="course-student-search"
                name="student-search"
                type="search"
                value={studentQuery}
                onChange={(event) => {
                  setStudentQuery(event.target.value);
                  setCandidates([]);
                  setHasSearchedStudents(false);
                }}
                autoComplete="off"
                minLength={2}
              />
            </label>
            <button className="button identity-secondary" type="submit" disabled={searchingStudents}>
              {searchingStudents && <LoaderCircle aria-hidden="true" size={15} className="auth-spinner" />}
              {searchingStudents ? "Searching..." : "Search"}
            </button>
          </form>
          {searchError && <p className="course-enrollment-error" role="alert">{searchError}</p>}
          {candidates.length > 0 && (
            <ul className="course-enrollment-list" aria-label="Matching student accounts">
              {candidates.map((student) => (
                <li className="course-enrollment-row" key={student.student_id}>
                  <span className="course-enrollment-person">
                    <strong>{personName(student.display_name, student.email)}</strong>
                    <span>{student.email || "Email unavailable"}</span>
                  </span>
                  <button
                    className="button identity-secondary course-enrollment-action"
                    type="button"
                    onClick={() => void addStudent(student)}
                    disabled={Boolean(busyStudentId) || student.already_enrolled}
                  >
                    {busyStudentId === student.student_id ? "Adding..." : student.already_enrolled ? "Already enrolled" : "Add"}
                  </button>
                </li>
              ))}
            </ul>
          )}
          {hasSearchedStudents && !searchingStudents && !searchError && candidates.length === 0 && (
            <p className="course-empty-state">No active Student accounts match that name or email.</p>
          )}
        </div>
      </section>

      <section className="course-detail-section" aria-labelledby="course-join-requests-title">
        <SectionHeading kicker="ENROLLMENT" title="Join requests" id="course-join-requests-title" />
        {requestsLoading ? (
          <p className="course-feedback" role="status"><LoaderCircle aria-hidden="true" size={16} className="auth-spinner" /> Loading join requests...</p>
        ) : requestsError ? (
          <div className="course-empty-state">
            <p className="auth-error" role="alert">{requestsError}</p>
            <button className="button identity-secondary" type="button" onClick={() => void loadRequests()}>Try again</button>
          </div>
        ) : requests.length === 0 ? (
          <p className="course-empty-state">There are no pending requests for this course.</p>
        ) : (
          <ul className="course-enrollment-list" aria-label="Pending course join requests">
            {requests.map((request) => (
              <li className="course-enrollment-row course-request-row" key={request.request_id}>
                <span className="course-enrollment-person">
                  <strong>{personName(request.display_name, request.email)}</strong>
                  <span>{request.email || "Email unavailable"} · Pending · Submitted {formatDate(request.submitted_at)}</span>
                </span>
                <span className="course-enrollment-actions">
                  <button
                    className="button button-primary course-enrollment-action"
                    type="button"
                    onClick={() => void reviewRequest(request, "approved")}
                    disabled={Boolean(busyRequestId)}
                  >
                    {busyRequestId === request.request_id ? "Saving..." : "Accept"}
                  </button>
                  <button
                    className="button identity-secondary course-enrollment-action"
                    type="button"
                    onClick={() => void reviewRequest(request, "rejected")}
                    disabled={Boolean(busyRequestId)}
                  >
                    Reject
                  </button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function joinStatusCopy(request: StudentRequest) {
  if (request.status === "pending") return "Pending lecturer review";
  if (request.status === "rejected") return "Request declined";
  return request.is_enrolled ? "Approved · enrolled" : "Approved · enrollment no longer active";
}

function MatchStatus({ course }: { course: CourseMatch }) {
  const action = getCourseJoinAction(course.is_enrolled, course.request_status);
  if (action === "enrolled") return <span className="course-enrollment-status">Enrolled</span>;
  if (action === "pending") return <span className="course-enrollment-status">Request pending</span>;
  if (course.request_status === "rejected") {
    return <span className="course-enrollment-status">Previous request declined</span>;
  }
  if (course.request_status === "approved") {
    return <span className="course-enrollment-status">Previous request approved; enrollment is not active</span>;
  }
  return null;
}

export function StudentCourseDiscovery() {
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<CourseMatch[]>([]);
  const [searching, setSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchError, setSearchError] = useState("");
  const [requests, setRequests] = useState<StudentRequest[]>([]);
  const [requestsLoading, setRequestsLoading] = useState(true);
  const [requestsError, setRequestsError] = useState("");
  const [busyCourseId, setBusyCourseId] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");

  const loadRequests = useCallback(async () => {
    const client = supabase;
    if (!client) {
      setRequestsError(supabaseConfigurationError);
      setRequests([]);
      setRequestsLoading(false);
      return;
    }

    setRequestsLoading(true);
    setRequestsError("");
    try {
      const { data, error } = await client.rpc("list_my_course_join_requests");
      if (error) throw error;
      setRequests((data ?? []) as unknown as StudentRequest[]);
    } catch (error) {
      setRequestsError(messageFor(error, "Unable to load your join request status."));
      setRequests([]);
    } finally {
      setRequestsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  async function searchCourses(searchQuery: string) {
    const cleanQuery = searchQuery.trim();
    if (cleanQuery.length < 2) {
      setSearchError("Enter at least two characters to search.");
      setMatches([]);
      return;
    }

    const client = supabase;
    if (!client) {
      setSearchError(supabaseConfigurationError);
      setMatches([]);
      return;
    }

    setHasSearched(true);
    setSearching(true);
    setSearchError("");
    setActionError("");
    try {
      const { data, error } = await client.rpc("search_courses_for_join", { p_query: cleanQuery });
      if (error) throw error;
      setMatches((data ?? []) as unknown as CourseMatch[]);
    } catch (error) {
      setSearchError(messageFor(error, "Unable to search courses."));
      setMatches([]);
    } finally {
      setSearching(false);
    }
  }

  async function submitSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await searchCourses(query);
  }

  async function requestToJoin(course: CourseMatch) {
    const client = supabase;
    if (!client) {
      setActionError(supabaseConfigurationError);
      return;
    }

    setBusyCourseId(course.course_id);
    setActionError("");
    setNotice("");
    try {
      const { data, error } = await client.rpc("request_course_join", {
        p_course_id: course.course_id,
      });
      if (error) throw error;
      setNotice(data
        ? "Your request to join " + course.course_name + " was sent to the lecturer."
        : "A request to join " + course.course_name + " is already pending.");
      await loadRequests();
      await searchCourses(query);
    } catch (error) {
      setActionError(messageFor(error, "Unable to send this join request."));
    } finally {
      setBusyCourseId("");
    }
  }

  return (
    <div className="course-enrollment">
      <section className="course-work-section course-discovery-section" aria-labelledby="course-discovery-title">
        <SectionHeading kicker="FIND A COURSE" title="Discover courses" id="course-discovery-title" />
        <p className="course-enrollment-intro">Search by course name or code. A request goes to the lecturer; you are enrolled only after approval.</p>
        <form className="course-enrollment-search-form" onSubmit={(event) => void submitSearch(event)}>
          <label className="auth-field" htmlFor="course-discovery-search">
            <span>Course name or code</span>
            <input
              id="course-discovery-search"
              name="course-search"
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setMatches([]);
                setHasSearched(false);
              }}
              autoComplete="off"
              minLength={2}
            />
          </label>
          <button className="button identity-secondary" type="submit" disabled={searching}>
            {searching && <LoaderCircle aria-hidden="true" size={15} className="auth-spinner" />}
            {searching ? "Searching..." : "Search"}
          </button>
        </form>
        {searchError && <p className="course-enrollment-error" role="alert">{searchError}</p>}
        {actionError && <p className="course-enrollment-error" role="alert">{actionError}</p>}
        {notice && <p className="course-success" role="status">{notice}</p>}
        {matches.length > 0 && (
          <ul className="course-list course-discovery-list" aria-label="Matching courses">
            {matches.map((course) => {
              const action = getCourseJoinAction(course.is_enrolled, course.request_status);
              return (
                <li className="course-list-item course-discovery-item" key={course.course_id}>
                  <div className="course-discovery-main">
                    <span className="course-list-code">{course.course_code}</span>
                    <span className="course-list-copy">
                      <strong>{course.course_name}</strong>
                      <span>{course.description?.trim() || "No course description has been added."}</span>
                      {course.request_created_at && <span>Last request · {formatDate(course.request_created_at)}</span>}
                    </span>
                  </div>
                  <div className="course-discovery-action">
                    <MatchStatus course={course} />
                    {action === "request" && (
                      <button
                        className="button button-primary course-enrollment-action"
                        type="button"
                        onClick={() => void requestToJoin(course)}
                        disabled={Boolean(busyCourseId)}
                      >
                        {busyCourseId === course.course_id ? "Sending..." : "Request to join"}
                      </button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {hasSearched && !searching && !searchError && matches.length === 0 && (
          <p className="course-empty-state">No courses match that name or code.</p>
        )}
      </section>

      <section className="course-work-section course-requests-section" aria-labelledby="student-requests-title">
        <SectionHeading kicker="YOUR ACTIVITY" title="Join request status" id="student-requests-title" />
        {requestsLoading ? (
          <p className="course-feedback" role="status"><LoaderCircle aria-hidden="true" size={16} className="auth-spinner" /> Loading request status...</p>
        ) : requestsError ? (
          <div className="course-empty-state">
            <p className="auth-error" role="alert">{requestsError}</p>
            <button className="button identity-secondary" type="button" onClick={() => void loadRequests()}>Try again</button>
          </div>
        ) : requests.length === 0 ? (
          <p className="course-empty-state">You have not requested to join a course yet.</p>
        ) : (
          <ul className="course-enrollment-list" aria-label="Your course join requests">
            {requests.map((request) => (
              <li className="course-enrollment-row" key={request.course_id}>
                <span className="course-enrollment-person">
                  {request.is_enrolled ? (
                    <Link className="course-request-course-link" to={"/student/courses/" + request.course_id}>
                      <strong>{request.course_name}</strong>
                    </Link>
                  ) : (
                    <strong>{request.course_name}</strong>
                  )}
                  <span>{request.course_code} · {joinStatusCopy(request)} · Submitted {formatDate(request.submitted_at)}</span>
                </span>
                <span className={"course-request-status course-request-status-" + request.status}>{request.status}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}