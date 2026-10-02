import { useRef, useState, type FormEvent } from "react";
import { LoaderCircle } from "lucide-react";
import { validateGeneratedQuestions } from "./lib/course-question-validation.js";
import { supabase, supabaseConfigurationError } from "./supabase";

type QuestionDifficulty = "easy" | "medium" | "hard";
type GeneratedQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  sources: Array<{ source_id: string; extraction_version: number; page_number: number }>;
};
type QuestionDraft = {
  id: string;
  question: GeneratedQuestion;
  selected: boolean;
  editDraft: GeneratedQuestion | null;
  editError: string;
  regenerating: boolean;
  regenerationError: string;
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

function validateDraftQuestion(question: GeneratedQuestion): GeneratedQuestion {
  const pages = [...new Map(question.sources.map((source) => {
    const key = source.source_id.toLowerCase() + ":" + source.extraction_version + ":" + source.page_number;
    return [key, {
      course_name: "",
      ...source,
      page_text: "Source reference retained from the generated question.",
      relevant_text: "Source reference retained from the generated question.",
    }];
  })).values()];
  return validateGeneratedQuestions({ questions: [question] }, 1, pages)[0];
}

async function loadMaterialTitles(sourceIds: string[]): Promise<Record<string, string>> {
  if (!supabase || sourceIds.length === 0) return {};
  try {
    const { data: sourceRows, error: sourceError } = await supabase
      .from("course_material_sources")
      .select("id, course_material_id")
      .in("id", sourceIds);
    if (sourceError) return {};

    const sources = (sourceRows ?? []) as unknown as Array<{ id: string; course_material_id: string }>;
    if (sources.length === 0) return {};
    const materialIds = [...new Set(sources.map((source) => source.course_material_id))];
    const { data: materialRows, error: materialError } = await supabase
      .from("course_materials")
      .select("id, title")
      .in("id", materialIds);
    if (materialError) return {};

    const titlesByMaterialId: Record<string, string> = {};
    for (const material of (materialRows ?? []) as unknown as Array<{ id: string; title: string }>) {
      if (material.title.trim()) titlesByMaterialId[material.id] = material.title.trim();
    }
    const titlesBySourceId: Record<string, string> = {};
    for (const source of sources) {
      const title = titlesByMaterialId[source.course_material_id];
      if (title) titlesBySourceId[source.id.toLowerCase()] = title;
    }
    return titlesBySourceId;
  } catch {
    return {};
  }
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
  const [drafts, setDrafts] = useState<QuestionDraft[] | null>(null);
  const [materialTitles, setMaterialTitles] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [savedCount, setSavedCount] = useState(0);
  const [saveError, setSaveError] = useState("");
  const [error, setError] = useState("");
  const draftSequence = useRef(0);
  const regeneratingIds = useRef(new Set<string>());

  const selectedDrafts = drafts?.filter((draft) => draft.selected) ?? [];
  const selectedCount = selectedDrafts.length;
  const selectedBusy = selectedDrafts.some((draft) => draft.editDraft !== null || draft.regenerating);

  function makeDrafts(questions: GeneratedQuestion[]) {
    return questions.map((question): QuestionDraft => ({
      id: "question-" + (++draftSequence.current),
      question,
      selected: true,
      editDraft: null,
      editError: "",
      regenerating: false,
      regenerationError: "",
    }));
  }

  async function requestGeneratedQuestions(body: Record<string, unknown>, expectedCount: number) {
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
      body: JSON.stringify(body),
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

    const generated = readGeneratedQuestions(result, expectedCount);
    if (!generated) throw new Error("The generated questions could not be displayed. Please try again.");
    return generated.map(validateDraftQuestion);
  }

  async function generateQuestions(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const generated = await requestGeneratedQuestions({ courseId, topic, questionCount, difficulty }, questionCount);
      const sourceIds = [...new Set(generated.flatMap((question) => question.sources.map((source) => source.source_id)))];
      setMaterialTitles(await loadMaterialTitles(sourceIds));
      setDrafts(makeDrafts(generated));
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setSubmitting(false);
    }
  }

  function updateDraft(draftId: string, update: (draft: QuestionDraft) => QuestionDraft) {
    setDrafts((current) => current?.map((draft) => draft.id === draftId ? update(draft) : draft) ?? null);
  }

  async function regenerateQuestion(draftId: string) {
    const draft = drafts?.find((item) => item.id === draftId);
    if (!draft || saved || regeneratingIds.current.has(draftId)) return;
    regeneratingIds.current.add(draftId);
    updateDraft(draftId, (current) => ({ ...current, regenerating: true, regenerationError: "" }));
    try {
      const [replacement] = await requestGeneratedQuestions({
        courseId,
        topic,
        questionCount: 1,
        difficulty,
        avoidQuestion: draft.question.question,
      }, 1);
      const newTitles = await loadMaterialTitles(replacement.sources.map((source) => source.source_id));
      setMaterialTitles((current) => ({ ...current, ...newTitles }));
      updateDraft(draftId, (current) => ({
        ...current,
        question: replacement,
        regenerating: false,
        regenerationError: "",
      }));
    } catch (requestError) {
      updateDraft(draftId, (current) => ({
        ...current,
        regenerating: false,
        regenerationError: errorMessage(requestError),
      }));
    } finally {
      regeneratingIds.current.delete(draftId);
    }
  }

  function beginEdit(draftId: string) {
    updateDraft(draftId, (draft) => ({
      ...draft,
      editDraft: { ...draft.question, options: [...draft.question.options], sources: draft.question.sources.map((source) => ({ ...source })) },
      editError: "",
    }));
  }

  function applyEdit(draftId: string) {
    const draft = drafts?.find((item) => item.id === draftId);
    if (!draft?.editDraft) return;
    try {
      const validated = validateDraftQuestion({ ...draft.editDraft, sources: draft.question.sources });
      updateDraft(draftId, (current) => ({ ...current, question: validated, editDraft: null, editError: "", regenerationError: "" }));
    } catch {
      updateDraft(draftId, (current) => ({
        ...current,
        editError: "Check the question, four distinct options, correct answer, and explanation before applying changes.",
      }));
    }
  }

  function cancelEdit(draftId: string) {
    updateDraft(draftId, (draft) => ({ ...draft, editDraft: null, editError: "" }));
  }

  function removeDraft(draftId: string) {
    if (saved) return;
    setDrafts((current) => current?.filter((draft) => draft.id !== draftId) ?? null);
  }

  async function saveApprovedQuestions() {
    setSaveError("");
    if (!drafts || selectedCount === 0) {
      setSaveError("Select at least one valid question to save.");
      return;
    }
    if (selectedBusy) {
      setSaveError("Finish editing or regenerating selected questions before saving.");
      return;
    }

    let approvedQuestions: GeneratedQuestion[];
    try {
      approvedQuestions = selectedDrafts.map((draft) => validateDraftQuestion(draft.question));
    } catch {
      setSaveError("One or more selected questions are invalid. Edit them before saving.");
      return;
    }

    setSaving(true);
    try {
      if (!supabase) throw new Error(supabaseConfigurationError);
      const { data, error: sessionError } = await supabase.auth.getSession();
      if (sessionError) throw sessionError;
      const accessToken = data.session?.access_token;
      if (!accessToken) throw new Error("Your session has expired. Sign in again, then retry.");

      const response = await fetch("/api/save-approved-questions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({ courseId, questions: approvedQuestions }),
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
          : "Approved questions could not be saved. Please try again.";
        throw new Error(message);
      }
      if (!isRecord(result)
        || !Array.isArray(result.savedQuestions)
        || result.savedQuestions.length !== approvedQuestions.length
        || !result.savedQuestions.every((item) => isRecord(item) && typeof item.id === "string" && sourceIdPattern.test(item.id))) {
        throw new Error("The saved questions could not be confirmed. Refresh the page before trying again.");
      }
      setSavedCount(approvedQuestions.length);
      setSaved(true);
    } catch (requestError) {
      setSaveError(errorMessage(requestError));
    } finally {
      setSaving(false);
    }
  }

  function returnToForm() {
    setDrafts(null);
    setSaved(false);
    setSavedCount(0);
    setSaveError("");
    setError("");
    setOpen(true);
  }

  return (
    <section className="course-question-generation course-detail-section" aria-labelledby="course-question-generation-title">
      <p className="auth-kicker">COURSE BRAIN</p>
      <h2 id="course-question-generation-title">Question generation</h2>
      <p className="course-question-intro">Create a question draft from relevant, processed pages in this course. Review every answer and source before using it.</p>

      {!open && !drafts && (
        <button className="button button-primary course-question-open" type="button" onClick={() => setOpen(true)}>
          Generate Questions
        </button>
      )}

      {open && !drafts && (
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

      {drafts && (
        <div className="course-question-review" aria-live="polite">
          <div className="course-question-review-heading">
            <div>
              <p className="auth-kicker">DRAFT REVIEW</p>
              <h3>{drafts.length} questions on {topic.trim()}</h3>
            </div>
            <button className="button identity-secondary" type="button" onClick={returnToForm} disabled={saving}>
              Generate another set
            </button>
          </div>
          <p className="course-question-review-note">{saved ? `${savedCount} selected questions are saved in this course and have not been published.` : "New questions are selected by default. Adjust the selection, edit or replace individual drafts, and save only the questions you approve."}</p>
          {drafts.length === 0 && <p className="course-question-empty" role="status">No question drafts remain. Generate another set to continue.</p>}
          <p className="course-question-selection-count" aria-live="polite">{selectedCount} of {drafts.length} questions selected</p>
          {selectedCount === 0 && drafts.length > 0 && <p className="course-question-empty" role="status">Select at least one question to enable saving.</p>}
          <ol className="course-question-list" aria-label="Generated question drafts">
            {drafts.map((draft, questionIndex) => {
              const question = draft.question;
              const editable = draft.editDraft;
              return (
                <li className="course-question-item" key={draft.id}>
                  <article>
                    <div className="course-question-item-toolbar">
                      <label className="course-question-select">
                        <input
                          type="checkbox"
                          checked={draft.selected}
                          onChange={(event) => updateDraft(draft.id, (current) => ({ ...current, selected: event.target.checked }))}
                          disabled={saved || saving}
                          aria-label={`Select question ${questionIndex + 1} for saving`}
                        />
                        <span>Include in saved questions</span>
                      </label>
                      <div className="course-question-item-actions">
                        <button type="button" className="button identity-secondary" aria-label={"Edit question " + (questionIndex + 1)} onClick={() => beginEdit(draft.id)} disabled={saved || saving || draft.regenerating || editable !== null}>
                          Edit
                        </button>
                        <button type="button" className="button identity-secondary" aria-label={draft.regenerating ? "Regenerating question " + (questionIndex + 1) : "Regenerate question " + (questionIndex + 1)} onClick={() => void regenerateQuestion(draft.id)} disabled={saved || saving || draft.regenerating || editable !== null}>
                          {draft.regenerating && <LoaderCircle aria-hidden="true" size={15} className="auth-spinner" />}
                          {draft.regenerating ? "Regenerating…" : "Regenerate"}
                        </button>
                        <button type="button" className="button identity-secondary" aria-label={"Remove question " + (questionIndex + 1)} onClick={() => removeDraft(draft.id)} disabled={saved || saving || draft.regenerating}>
                          Remove
                        </button>
                      </div>
                    </div>
                    {draft.regenerating && <p className="course-feedback" role="status" aria-live="polite"><LoaderCircle aria-hidden="true" size={15} className="auth-spinner" /> Regenerating this question from course materials…</p>}
                    {draft.regenerationError && <p className="course-question-inline-error" role="alert">{draft.regenerationError} The existing question is unchanged.</p>}

                    {editable ? (
                      <form className="course-question-edit-form" onSubmit={(event) => { event.preventDefault(); applyEdit(draft.id); }}>
                        <label className="auth-field">
                          <span>Question</span>
                          <textarea value={editable.question} onChange={(event) => updateDraft(draft.id, (current) => current.editDraft ? ({ ...current, editDraft: { ...current.editDraft, question: event.target.value }, editError: "" }) : current)} maxLength={2000} required />
                        </label>
                        <fieldset className="course-question-edit-options">
                          <legend>Four answer options</legend>
                          {editable.options.map((option, optionIndex) => (
                            <label className="auth-field" key={optionIndex}>
                              <span>Option {String.fromCharCode(65 + optionIndex)}</span>
                              <input
                                value={option}
                                onChange={(event) => updateDraft(draft.id, (current) => {
                                  if (!current.editDraft) return current;
                                  const options = [...current.editDraft.options];
                                  const previousOption = options[optionIndex];
                                  options[optionIndex] = event.target.value;
                                  const correctAnswer = current.editDraft.correctAnswer === previousOption ? event.target.value : current.editDraft.correctAnswer;
                                  return { ...current, editDraft: { ...current.editDraft, options, correctAnswer }, editError: "" };
                                })}
                                maxLength={500}
                                required
                              />
                            </label>
                          ))}
                        </fieldset>
                        <label className="auth-field">
                          <span>Correct answer</span>
                          <select value={editable.correctAnswer} onChange={(event) => updateDraft(draft.id, (current) => current.editDraft ? ({ ...current, editDraft: { ...current.editDraft, correctAnswer: event.target.value }, editError: "" }) : current)}>
                            {editable.options.map((option, optionIndex) => <option key={optionIndex} value={option}>{String.fromCharCode(65 + optionIndex)}. {option || "Enter an option"}</option>)}
                          </select>
                        </label>
                        <label className="auth-field">
                          <span>Explanation</span>
                          <textarea value={editable.explanation} onChange={(event) => updateDraft(draft.id, (current) => current.editDraft ? ({ ...current, editDraft: { ...current.editDraft, explanation: event.target.value }, editError: "" }) : current)} maxLength={3000} required />
                        </label>
                        {draft.editError && <p className="course-question-inline-error" role="alert">{draft.editError}</p>}
                        <div className="course-question-actions">
                          <button className="button button-primary" type="submit">Apply changes</button>
                          <button className="button identity-secondary" type="button" onClick={() => cancelEdit(draft.id)}>Cancel edit</button>
                        </div>
                      </form>
                    ) : (
                      <>
                        <h4><span>Question {questionIndex + 1}</span>{question.question}</h4>
                        <ol className="course-question-options" type="A" aria-label={`Options for question ${questionIndex + 1}`}>
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
                              <li className="course-question-citation" key={source.source_id + "-" + source.extraction_version + "-" + source.page_number}>
                                {materialTitles[source.source_id.toLowerCase()] || "Course material"} · Page {source.page_number}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </>
                    )}
                  </article>
                </li>
              );
            })}
          </ol>
          <div className="course-question-actions">
            {saveError && <p className="auth-error" role="alert">{saveError}</p>}
            {saved && <p className="course-feedback" role="status">Selected questions saved successfully.</p>}
            <button
              className="button button-primary"
              type="button"
              onClick={() => void saveApprovedQuestions()}
              disabled={saving || saved || selectedCount === 0 || selectedBusy}
            >
              {saving && <LoaderCircle aria-hidden="true" size={16} className="auth-spinner" />}
              {saving ? "Saving questions…" : saved ? "Questions saved" : `Save ${selectedCount} selected question${selectedCount === 1 ? "" : "s"}`}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
