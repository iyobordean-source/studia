import { ArrowUpRight } from "lucide-react";

export default function FinalCTA() {
  return (
    <section className="final-cta" id="account-access">
      <div className="page-container mx-auto max-w-[1200px] final-cta-inner">
        <div>
          <p className="eyebrow">
            <span className="eyebrow-rule" aria-hidden="true" />
            Studia
          </p>
          <h2>Let course knowledge guide what comes next.</h2>
          <p>
            Connect the materials you teach from with the learning steps
            students take next.
          </p>
        </div>
        <div className="final-cta-actions">
          <a className="button button-light" href="/sign-up">
            Get started
            <ArrowUpRight aria-hidden="true" size={16} strokeWidth={1.8} />
          </a>
          <a className="final-signin" href="/sign-in">
            Already have an account? <span>Sign in</span>
          </a>
        </div>
      </div>
    </section>
  );
}
