function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sourceKey(sourceId, extractionVersion, pageNumber) {
  return sourceId.toLowerCase() + ":" + extractionVersion + ":" + pageNumber;
}

export class InvalidQuestionOutputError extends Error {}

export function validateGeneratedQuestions(output, questionCount, retrievedPages) {
  if (!isRecord(output) || !Array.isArray(output.questions) || output.questions.length !== questionCount) {
    throw new InvalidQuestionOutputError("Generated question count is invalid.");
  }

  const allowedSources = new Map(
    retrievedPages.map((page) => [
      sourceKey(page.source_id, page.extraction_version, page.page_number),
      { source_id: page.source_id, extraction_version: page.extraction_version, page_number: page.page_number },
    ]),
  );

  return output.questions.map((candidate) => {
    if (!isRecord(candidate)
      || typeof candidate.question !== "string"
      || candidate.question.trim().length === 0
      || candidate.question.length > 2000
      || !Array.isArray(candidate.options)
      || candidate.options.length !== 4
      || !candidate.options.every((option) => typeof option === "string" && option.trim().length > 0 && option.length <= 500)
      || typeof candidate.correctAnswer !== "string"
      || typeof candidate.explanation !== "string"
      || candidate.explanation.trim().length === 0
      || candidate.explanation.length > 3000
      || !Array.isArray(candidate.sources)
      || candidate.sources.length === 0) {
      throw new InvalidQuestionOutputError("A generated question is missing required fields.");
    }

    const options = candidate.options.map((option) => option.trim());
    if (new Set(options.map((option) => option.toLocaleLowerCase())).size !== 4) {
      throw new InvalidQuestionOutputError("Each question must have four distinct options.");
    }
    const correctAnswer = candidate.correctAnswer.trim();
    if (!options.includes(correctAnswer)) {
      throw new InvalidQuestionOutputError("The correct answer must exactly match one option.");
    }

    const sources = candidate.sources.map((source) => {
      if (!isRecord(source)
        || typeof source.source_id !== "string"
        || typeof source.extraction_version !== "number"
        || !Number.isInteger(source.extraction_version)
        || typeof source.page_number !== "number"
        || !Number.isInteger(source.page_number)) {
        throw new InvalidQuestionOutputError("A source reference is malformed.");
      }
      const allowed = allowedSources.get(sourceKey(source.source_id, source.extraction_version, source.page_number));
      if (!allowed) throw new InvalidQuestionOutputError("A source reference was not part of retrieved context.");
      return allowed;
    });

    return {
      question: candidate.question.trim(),
      options,
      correctAnswer,
      explanation: candidate.explanation.trim(),
      sources: [...new Map(sources.map((source) => [sourceKey(source.source_id, source.extraction_version, source.page_number), source])).values()],
    };
  });
}
