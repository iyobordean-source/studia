import {
  ArrowRight,
  BookOpen,
  BrainCircuit,
  ClipboardCheck,
  LineChart,
  PencilLine,
} from "lucide-react";
import SectionHeading from "./SectionHeading";

const steps = [
  { title: "Course materials", icon: BookOpen },
  { title: "Course Brain", icon: BrainCircuit },
  { title: "Assessment", icon: ClipboardCheck },
  { title: "Course intelligence", icon: LineChart },
  { title: "Targeted practice", icon: PencilLine },
];

export default function ProductLoop() {
  return (
    <section className="loop-section section-space" id="how-it-works">
      <div className="page-container mx-auto max-w-[1200px]">
        <SectionHeading
          eyebrow="How it works"
          title="Keep course knowledge connected to what comes next."
          description="Course materials become the foundation for assessment, insight and focused practice—not a collection of disconnected steps."
        />

        <ol className="loop-list" aria-label="Studia learning cycle">
          {steps.map(({ title, icon: Icon }, index) => (
            <li className="loop-step" key={title}>
              <span className="loop-index">0{index + 1}</span>
              <span className="loop-icon" aria-hidden="true">
                <Icon size={21} strokeWidth={1.65} />
              </span>
              <span className="loop-title">{title}</span>
              {index < steps.length - 1 && (
                <ArrowRight
                  className="loop-arrow"
                  aria-hidden="true"
                  size={16}
                  strokeWidth={1.5}
                />
              )}
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
