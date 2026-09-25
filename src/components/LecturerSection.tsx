import { Check } from "lucide-react";
import SectionHeading from "./SectionHeading";
import { LecturerPreview } from "./Previews";

const lecturerBenefits = [
  "Bring course materials together in one place.",
  "Draft assessment questions grounded in your teaching.",
  "Review, edit and publish with lecturer oversight.",
  "See which topics need more attention across a course.",
];

export default function LecturerSection() {
  return (
    <section className="audience-section lecturer-section" id="lecturers">
      <div className="page-container mx-auto max-w-[1200px] audience-layout">
        <div className="audience-copy">
          <SectionHeading
            eyebrow="For lecturers"
            title="Build assessments from what you already teach."
            description="Bring lecture notes, readings and course resources together. Studia can use them to draft grounded questions, ready for your review before they reach students."
          />
          <ul className="benefit-list">
            {lecturerBenefits.map((benefit) => (
              <li key={benefit}>
                <Check aria-hidden="true" size={17} strokeWidth={1.8} />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="audience-preview">
          <LecturerPreview />
        </div>
      </div>
    </section>
  );
}
