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

import type { QuestionCount } from "./course-question-types.js";
export type { QuestionCount } from "./course-question-types.js";

export declare class InvalidQuestionOutputError extends Error {}

export declare function validateGeneratedQuestions(
  output: unknown,
  questionCount: QuestionCount,
  retrievedPages: RetrievedCoursePage[],
): GeneratedQuestion[];
