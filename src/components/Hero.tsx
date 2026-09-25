import { ArrowRight } from "lucide-react";
import HeroPreview from "./Previews";

export default function Hero() {
  return (
    <section className="hero-section">
      <div className="page-container mx-auto max-w-[1200px] hero-layout">
        <div className="hero-copy">
          <p className="eyebrow">
            <span className="eyebrow-rule" aria-hidden="true" />
            Built around what you teach
          </p>
          <h1>
            From course material to a clearer <em>learning loop.</em>
          </h1>
          <p className="hero-description">
            Studia connects the materials lecturers teach from with the
            assessments students learn from—and the insight that helps them know
            what to practise next.
          </p>
          <div className="hero-actions">
            <a className="button button-primary" href="/sign-up">
              Get started
              <ArrowRight aria-hidden="true" size={17} strokeWidth={1.8} />
            </a>
            <a className="text-action" href="#how-it-works">
              See how it works
            </a>
          </div>
          <p className="hero-note">Grounded in course materials. Reviewed by lecturers.</p>
        </div>

        <div className="hero-visual">
          <HeroPreview />
        </div>
      </div>
    </section>
  );
}
