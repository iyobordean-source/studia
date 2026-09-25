import { Check } from "lucide-react";
import SectionHeading from "./SectionHeading";
import { StudentPreview } from "./Previews";

const studentBenefits = [
  "Take assessments connected to your course.",
  "See which topics are clear and which need another look.",
  "Practise focused on the areas you find difficult.",
  "Reassess and see how your understanding develops.",
];

export default function StudentSection() {
  return (
    <section className="audience-section student-section" id="students">
      <div className="page-container mx-auto max-w-[1200px] audience-layout audience-layout-reversed">
        <div className="audience-preview">
          <StudentPreview />
        </div>
        <div className="audience-copy">
          <SectionHeading
            eyebrow="For students"
            title="Make the next step in learning clearer."
            description="See more than a result. Understand what needs attention, practise with a purpose, and come back ready to reassess."
          />
          <ul className="benefit-list">
            {studentBenefits.map((benefit) => (
              <li key={benefit}>
                <Check aria-hidden="true" size={17} strokeWidth={1.8} />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
