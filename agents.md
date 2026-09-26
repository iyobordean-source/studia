# Rules for AI coding agents

- Read `product.md` before implementing product features.
- Read `design.md` before implementing UI.
- Read `architecture.md` before making architectural changes.
- Read `TODO.md` before selecting work.
- Avoid unnecessary dependencies and explain why a new dependency is needed.
- Avoid unnecessary folder restructuring. Follow the existing project structure unless a documented reason supports a change.
- Preserve working code and keep changes focused.
- Explain important architectural decisions in the change summary and relevant documentation.
- Never silently change the technology stack.
- Never mark a TODO item complete without implementing it and checking that it works.
- Never replace a working system with a different approach without justification.
- Keep code understandable and business logic easy to find.
- Flag uncertainty and ask for clarification when a requirement cannot be inferred safely; do not invent requirements.
- Implement one approved vertical slice at a time. The email/password and Google authentication foundation, role-aware profiles, authorization, initial authenticated Student experience, and Course Foundation are implemented. Preserve those foundations; do not jump ahead to materials, Course Brain, assessments, or AI/RAG features unless that slice is selected.
- Treat database-backed roles, account/application status, and RLS as authorization sources. Never grant privileged access from frontend state or user metadata.


