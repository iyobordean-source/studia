type SectionHeadingProps = {
  eyebrow: string;
  title: string;
  description: string;
};

export default function SectionHeading({
  eyebrow,
  title,
  description,
}: SectionHeadingProps) {
  return (
    <div className="section-heading">
      <p className="eyebrow">
        <span className="eyebrow-rule" aria-hidden="true" />
        {eyebrow}
      </p>
      <h2>{title}</h2>
      <p className="section-description">{description}</p>
    </div>
  );
}
