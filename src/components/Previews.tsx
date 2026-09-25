import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  Check,
  ClipboardCheck,
  FileText,
  LayoutDashboard,
  Target,
} from "lucide-react";

function DemoCaption({ children }: { children: string }) {
  return (
    <figcaption className="demo-caption">
      <span className="demo-caption-mark" aria-hidden="true" />
      {children}
    </figcaption>
  );
}

function PreviewSidebar() {
  return (
    <aside className="preview-sidebar" aria-hidden="true">
      <div className="preview-sidebar-brand">S</div>
      <div className="preview-sidebar-items">
        <span className="preview-side-item is-current">
          <LayoutDashboard aria-hidden="true" size={15} />
          Overview
        </span>
        <span className="preview-side-item">
          <BookOpen aria-hidden="true" size={15} />
          Courses
        </span>
        <span className="preview-side-item">
          <FileText aria-hidden="true" size={15} />
          Materials
        </span>
        <span className="preview-side-item">
          <ClipboardCheck aria-hidden="true" size={15} />
          Assessments
        </span>
      </div>
      <span className="preview-sidebar-avatar" aria-hidden="true">L</span>
    </aside>
  );
}

export default function HeroPreview() {
  return (
    <figure className="hero-preview-figure">
      <div className="app-frame hero-app-frame">
        <div className="app-frame-topbar">
          <span className="app-frame-brand"><span aria-hidden="true">S</span> Studia</span>
          <span className="demo-label">Illustrative demo · Example data</span>
        </div>
        <div className="app-frame-body">
          <PreviewSidebar />
          <div className="app-workspace">
            <div className="workspace-heading">
              <div>
                <p className="interface-eyebrow">DEMO COURSE · BIOLOGY</p>
                <h2>Foundations of ecology</h2>
                <p className="workspace-subtitle">Course overview</p>
              </div>
              <span className="lecturer-avatar" aria-hidden="true">L</span>
            </div>

            <div className="materials-strip">
              <span className="materials-icon"><BookOpen aria-hidden="true" size={17} /></span>
              <div>
                <span className="mini-label">COURSE MATERIALS</span>
                <p>Lecture notes and reading extracts</p>
              </div>
              <span className="materials-count">Example set</span>
            </div>

            <div className="hero-preview-grid">
              <section className="interface-panel assessment-panel" aria-labelledby="demo-assessment-title">
                <div className="panel-title-row">
                  <div>
                    <span className="mini-label">ASSESSMENT DRAFT</span>
                    <h3 id="demo-assessment-title">Energy flow</h3>
                  </div>
                  <span className="status-tag status-neutral">In review</span>
                </div>
                <div className="question-preview-row">
                  <span className="question-number">01</span>
                  <p>How does energy move through a food web?</p>
                </div>
                <div className="question-preview-row">
                  <span className="question-number">02</span>
                  <p>What can change a trophic cascade?</p>
                </div>
                <p className="source-note"><FileText aria-hidden="true" size={13} /> Based on course materials</p>
              </section>

              <section className="interface-panel signals-panel" aria-labelledby="demo-signals-title">
                <span className="mini-label">SAMPLE RESPONSE DATA</span>
                <h3 id="demo-signals-title">Learning signals</h3>
                <div className="signal-row">
                  <span>Energy transfer</span>
                  <span className="status-tag status-attention">Needs practice</span>
                </div>
                <div className="signal-row">
                  <span>Food webs</span>
                  <span className="status-tag status-developing">Developing</span>
                </div>
                <div className="signal-row">
                  <span>Ecosystems</span>
                  <span className="status-tag status-secure">On track</span>
                </div>
                <span className="signal-footer"><Target aria-hidden="true" size={13} /> Focused practice follows</span>
              </section>
            </div>
          </div>
        </div>
      </div>
      <DemoCaption>Static product preview. All course and response details are illustrative.</DemoCaption>
    </figure>
  );
}

export function LecturerPreview() {
  return (
    <figure className="preview-figure lecturer-preview-figure">
      <div className="preview-card lecturer-preview-card">
        <div className="preview-card-header">
          <div className="preview-card-brand"><span aria-hidden="true">S</span> Studia</div>
          <span className="demo-label">Demo workspace</span>
        </div>
        <div className="lecturer-preview-body">
          <p className="mini-label">ASSESSMENT STUDIO · EXAMPLE</p>
          <div className="lecturer-preview-title-row">
            <div>
              <h3>Energy flow and ecosystems</h3>
              <p>Foundations of ecology</p>
            </div>
            <span className="status-tag status-neutral">Draft · review</span>
          </div>
          <div className="grounding-note">
            <FileText aria-hidden="true" size={16} />
            <span>Grounded in <strong>Lecture notes · Energy transfer</strong></span>
          </div>
          <div className="draft-question">
            <span className="question-number">01</span>
            <div>
              <span className="mini-label">QUESTION · MULTIPLE CHOICE</span>
              <p>Which statement best describes energy transfer through a food web?</p>
              <div className="topic-tags"><span>Energy transfer</span><span>Food webs</span></div>
            </div>
          </div>
          <div className="draft-question draft-question-muted">
            <span className="question-number">02</span>
            <p>What might happen if a primary consumer is removed?</p>
          </div>
          <div className="preview-card-footer">
            <span><Check aria-hidden="true" size={14} /> Lecturer review before publishing</span>
            <span className="preview-text-action">Edit draft <ArrowRight aria-hidden="true" size={14} /></span>
          </div>
        </div>
      </div>
      <DemoCaption>Illustrative lecturer view · example course and draft</DemoCaption>
    </figure>
  );
}

export function StudentPreview() {
  return (
    <figure className="preview-figure student-preview-figure">
      <div className="preview-card student-preview-card">
        <div className="preview-card-header">
          <div className="preview-card-brand"><span aria-hidden="true">S</span> Studia</div>
          <span className="demo-label">Student view · Example</span>
        </div>
        <div className="student-preview-body">
          <p className="mini-label">YOUR COURSE · FOUNDATIONS OF ECOLOGY</p>
          <h3>A useful next step</h3>
          <p className="student-summary">Your assessment points to a topic worth revisiting.</p>
          <div className="student-focus-card">
            <div className="student-focus-icon"><Target aria-hidden="true" size={18} /></div>
            <div className="student-focus-content">
              <span className="mini-label">PRACTICE FOCUS</span>
              <h4>Energy transfer in food webs</h4>
              <p>Review how energy moves between trophic levels.</p>
            </div>
            <ArrowRight className="student-focus-arrow" aria-hidden="true" size={17} />
          </div>
          <div className="student-steps">
            <span className="student-step-done"><Check aria-hidden="true" size={13} /> Assessment complete</span>
            <span className="student-step-current"><span aria-hidden="true" /> Practice suggested</span>
            <span className="student-step-upcoming"><span aria-hidden="true" /> Reassess when ready</span>
          </div>
        </div>
      </div>
      <DemoCaption>Illustrative student view · all learning details are examples</DemoCaption>
    </figure>
  );
}

export function IntelligencePreview() {
  return (
    <figure className="preview-figure intelligence-preview-figure">
      <div className="intelligence-card">
        <div className="intelligence-card-header">
          <div>
            <span className="mini-label">COURSE INTELLIGENCE</span>
            <h3>From responses to next steps</h3>
          </div>
          <span className="demo-label">Illustrative example</span>
        </div>
        <div className="intelligence-table" role="table" aria-label="Illustrative assessment patterns and practice focus">
          <div className="intelligence-table-head" role="row">
            <span role="columnheader">Assessment signal</span>
            <span role="columnheader">Learning focus</span>
            <span role="columnheader">Next step</span>
          </div>
          <div className="intelligence-table-row" role="row">
            <span role="cell"><span className="signal-dot dot-attention" aria-hidden="true" />Energy transfer question</span>
            <span role="cell">Explanation needs another look</span>
            <span role="cell"><span className="table-action">Practice topic <ArrowRight aria-hidden="true" size={13} /></span></span>
          </div>
          <div className="intelligence-table-row" role="row">
            <span role="cell"><span className="signal-dot dot-developing" aria-hidden="true" />Food-web relationships</span>
            <span role="cell">Understanding is developing</span>
            <span role="cell"><span className="table-action">Review source <ArrowRight aria-hidden="true" size={13} /></span></span>
          </div>
        </div>
        <div className="learning-sequence" aria-label="Example learning sequence: assessment, targeted practice, reassessment">
          <div className="sequence-item"><span className="sequence-mark sequence-mark-first"><ClipboardCheck aria-hidden="true" size={15} /></span><span>Assessment</span></div>
          <ArrowRight className="sequence-arrow" aria-hidden="true" size={17} />
          <div className="sequence-item"><span className="sequence-mark"><Target aria-hidden="true" size={15} /></span><span>Targeted practice</span></div>
          <ArrowRight className="sequence-arrow" aria-hidden="true" size={17} />
          <div className="sequence-item"><span className="sequence-mark"><BrainCircuit aria-hidden="true" size={15} /></span><span>Reassessment</span></div>
        </div>
      </div>
      <DemoCaption>Example course signals. This is sample interface data, not a real result.</DemoCaption>
    </figure>
  );
}
