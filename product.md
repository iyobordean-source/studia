# Product

## What Studia is

Studia is an AI-powered university assessment and course intelligence platform. It uses lecturer-provided course materials as the foundation for assessment and learning support.

## Problem it solves

Lecturers need a reliable way to turn their course materials into useful assessments and understand how students are doing. Students need clear feedback about what they know and what they should practise next. Studia connects those needs in one course-centred workflow.

## Target users and roles

Studia V1 has three product roles:

- **Student:** can create a student account and access student workflows. Access to courses follows approved course-membership rules.
- **Lecturer:** can apply for lecturer access. A submitted application is persisted as pending; lecturer privileges begin only after administrator approval.
- **Admin:** has no public signup. Admin accounts and privileges are provisioned through trusted database operations.

A role displayed or selected in the interface is never sufficient to grant privileged access. The persisted profile, account status, and an approved lecturer application determine authorization.

## Core product loop

Course materials -> Course Brain -> retrieval-grounded assessment generation -> lecturer review and editing -> published assessment -> student assessment -> grading -> topic performance -> weak-area identification -> targeted practice -> reassessment.

RAG/source grounding is part of V1: assessment generation must retrieve relevant lecturer-provided course material and retain source traceability for lecturer review.

## V1 scope and features

V1 is centred on this course and assessment loop:

- Lecturer course and course-material management.
- Building a Course Brain from lecturer-provided material.
- Generating assessments grounded in that material.
- Lecturer review, editing, and publishing of generated questions.
- Student course and assessment participation.
- Assessment completion and results.
- Performance analysis, weak-area identification, targeted practice, and reassessment.

AI output should support lecturer judgement. Lecturers review generated questions before publishing them.

## Explicit non-goals

- A generic AI quiz generator detached from course materials.
- An AI tutor as the primary product.
- Public administrator signup or unapproved lecturer privileges.
- Unreviewed AI-generated assessments being treated as published course content.
- Features outside the course, assessment, course-intelligence, and targeted-learning loop before the core workflow is established.

## Product principles

- Ground AI-generated work in lecturer-provided course materials.
- Keep lecturers in control of assessment quality and publication.
- Help students understand and act on performance feedback.
- Keep the product course-centred and focused on learning outcomes.
- Prefer clear, trustworthy experiences over feature volume.






