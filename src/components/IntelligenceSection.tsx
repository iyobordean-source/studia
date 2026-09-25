import SectionHeading from "./SectionHeading";
import { IntelligencePreview } from "./Previews";

export default function IntelligenceSection() {
  return (
    <section className="intelligence-section section-space">
      <div className="page-container mx-auto max-w-[1200px] intelligence-layout">
        <div className="intelligence-copy">
          <SectionHeading
            eyebrow="Course intelligence"
            title="A score is only the beginning."
            description="Course intelligence connects results to the topics and questions behind them. That makes it easier to focus practice—and understand what changes when students try again."
          />
          <p className="intelligence-principle">
            From a result, to a reason, to a useful next step.
          </p>
        </div>
        <div className="intelligence-preview">
          <IntelligencePreview />
        </div>
      </div>
    </section>
  );
}
