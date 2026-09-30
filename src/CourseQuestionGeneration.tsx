import { useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { supabase, supabaseConfigurationError } from "./supabase";

type QuestionDifficulty = "easy" | "medium" | "hard";
type GeneratedQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  sources: Array<{ source_id: string; extraction_version: number; page_number: number }>;
};

const sourceIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readGeneratedQuestions(value: unknown, expectedCount: number): GeneratedQuestion[] | null {
  if (!isRecord(value) || !Array.isArray(value.questions) || value.questions.length !== expectedCount) return null;
  const questions: GeneratedQuestion[] = [];
  for (const item of value.questions) {
    if (!isRecord(item)
      || typeof item.question !== "string"
      || !item.question.trim()
      || !Array.isArray(item.options)
      || item.options.length !== 4
      || !item.options.every((option) => typeof option === "string" && option.trim())
      || new Set(item.options).size !== 4
      || typeof item.correctAnswer !== "string"
      || !item.options.includes(item.correctAnswer)
      || typeof item.explanation !== "string"
      || !item.explanation.trim()
      || !Array.isArray(item.sources)
      || item.sources.length === 0) {
      return null;
    }
    const sources: GeneratedQuestion["sources"] = [];
    for (const source of item.sources) {
      if (!isRecord(source)
        || typeof source.source_id !== "string"
        || !sourceIdPattern.test(source.source_id)
        || typeof source.extraction_version !== "number"
        || !Number.isInteger(source.extraction_version)
        || source.extraction_version < 1
        || typeof source.page_number !== "number"
        || !Number.isInteger(source.page_number)
        || source.page_number < 1) {
        return null;
      }
      sources.push({
        source_id: source.source_id,
        extraction_version: source.extraction_version,
        page_number: source.page_number,
      });
    }
    questions.push({
      question: item.question,
      options: item.options as string[],
      correctAnswer: item.correctAnswer,
      explanation: item.explanation,
      sources,
    });
  }
  return questions;
}

function errorMessage(error: unknown) {
  return error instanceof Error && error.message.trim()
    ? error.message
    : "Question generation could not be completed. Please try again.";
}

export function CourseQuestionGeneration({ courseId }: { courseId: string }) {
  const [open, setOpen] = useState(false);
  const [topic, setTopic] = useState("");
  const [questionCount, setQuestionCount] = useState<5 | 10>(5);
  const [difficulty, setDifficulty] = useState<QuestionDifficulty>("medium");
  const [questions, setQuestions] = useState<GeneratedQuestion[] | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  async function generateQuestions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      if (!supabase) throw new Error(supabaseConfigurationError);
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Your session has expired. Sign in again, then retry.");

      const response = await fetch("/api/generate-course-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({ courseId, topic, questionCount, difficulty }),
      });
      let result: unknown = null;
      try {
        result = await response.json();
      } catch {
        // Use the safe fallback below when the endpoint does not return JSON.
      }
      if (!response.ok) {
        const message = isRecord(result) && typeof result.error === "string" && result.error.trim()
          ? result.error
          : "Question generation could not be completed. Please try again.";
        throw new Error(message);
      }

      const generated = readGeneratedQuestions(result, questionCount);
      if (!generated) throw new Error("The generated questions could not be displayed. Please try again.");
      setQuestions(generated);
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function returnToForm() {
    setQuestions(null);
    setError("");
    setOpen(true);
  }

  return (
    <section className="course-question-generation course-detail-section" aria-labelledby="course-question-generation-title">
      <p className="auth-kicker">COURSE BRAIN</p>
      <h2 id="course-question-generation-title">Question generation</h2>
      <p className="course-question-intro">Create a question draft from relevant, processed pages in this course. Review every answer and source before using it.</p>

      {!open && !questions && (
        <button className="button button-primary course-question-open" type="button" onClick={() => setOpen(true)}>
          Generate Questions
        </button>
      )}

      {open && !questions && (
        <form className="course-question-form" onSubmit={(event) => void generateQuestions(event)}>
          <label className="auth-field">
            <span>Topic</span>
            <input
              name="topic"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              minLength={2}
              maxLength={200}
              autoComplete="off"
              required
              disabled={submitting}
              placeholder="For example, binary search"
            />
          </label>
          <div className="course-question-form-options">
            <label className="auth-field">
              <span>Question count</span>
              <select
                name="question-count"
                value={questionCount}
                onChange={(event) => setQuestionCount(event.target.value === "10" ? 10 : 5)}
                disabled={submitting}
              >
                <option value={5}>5 questions</option>
                <option value={10}>10 questions</option>
              </select>
            </label>
            <label className="auth-field">
              <span>Difficulty</span>
              <select
                name="difficulty"
                value={difficulty}
                onChange={(event) => setDifficulty(event.target.value as QuestionDifficulty)}
                disabled={submitting}
              >
                <option value="easy">Easy</option>
                <option value="medium">Medium</option>
                <option value="hard">Hard</option>
              </select>
            </label>
          </div>
          {error && <p className="auth-error" role="alert">{error}</p>}
          {submitting && (
            <p className="course-feedback" role="status" aria-live="polite">
              <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />
              Generating questions from course materials…
            </p>
          )}
          <div className="course-question-actions">
            <button className="button button-primary" type="submit" disabled={submitting}>
              {submitting && <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />}
              {submitting ? "Generating…" : "Generate questions"}
            </button>
            <button className="button identity-secondary" type="button" onClick={() => { setOpen(false); setError(""); }} disabled={submitting}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {questions && (
        <div className="course-question-review" aria-live="polite">
          <div className="course-question-review-heading">
            <div>
              <p className="auth-kicker">DRAFT REVIEW</p>
              <h3>{questions.length} questions on {topic.trim()}</h3>
            </div>
            <button className="button identity-secondary" type="button" onClick={returnToForm}>
              Generate another set
            </button>
          </div>
          <p className="course-question-review-note">These questions have not been saved or published. Check the answer, explanation, and page sources before use.</p>
          <ol className="course-question-list" aria-label="Generated question drafts">
            {questions.map((question, questionIndex) => (
              <li className="course-question-item" key={questionIndex}>
                <article>
                  <h4><span>Question {questionIndex + 1}</span>{question.question}</h4>
                  <ol className="course-question-options" type="A" aria-label={"Options for question " + (questionIndex + 1)}>
                    {question.options.map((option, optionIndex) => {
                      const correct = option === question.correctAnswer;
                      return (
                        <li className={correct ? "is-correct" : undefined} key={optionIndex}>
                          <span className="course-question-option-copy">
                            <span className="course-question-option-letter">{String.fromCharCode(65 + optionIndex)}.</span>
                            <span>{option}</span>
                          </span>
                          {correct && <span className="course-question-correct-label">Correct answer</span>}
                        </li>
                      );
                    })}
                  </ol>
                  <div className="course-question-explanation">
                    <h5>Explanation</h5>
                    <p>{question.explanation}</p>
                  </div>
                  <div className="course-question-sources">
                    <h5>Sources</h5>
                    <ul>
                      {question.sources.map((source) => (
                        <li key={source.source_id + "-" + source.extraction_version + "-" + source.page_number}>
                          Page {source.page_number} · extraction version {source.extraction_version} · source {source.source_id}
                        </li>
                      ))}
                    </ul>
                  </div>
                </article>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
