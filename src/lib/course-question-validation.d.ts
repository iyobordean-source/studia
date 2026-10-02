export type RetrievedCoursePage = {
  course_name: string;
  source_id: string;
  extraction_version: number;
  page_number: number;
  page_text: string;
  relevant_text: string;
};

export type GeneratedQuestion = {
  question: string;
  options: string[];
  correctAnswer: string;
  explanation: string;
  sources: Array<{ source_id: string; extraction_version: number; page_number: number }>;
};

export type QuestionCount = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10;

export declare class InvalidQuestionOutputError extends Error {}

export declare function validateGeneratedQuestions(
  output: unknown,
  questionCount: QuestionCount,
  retrievedPages: RetrievedCoursePage[],
): GeneratedQuestion[];
