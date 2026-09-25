export default function Footer() {
  return (
    <footer className="site-footer">
      <div className="page-container mx-auto max-w-[1200px] footer-row">
        <a className="wordmark footer-wordmark" href="/" aria-label="Studia home">
          <span>Stud</span><span className="wordmark-accent">ia</span>
        </a>
        <p>Course knowledge, carried forward.</p>
        <nav className="footer-links" aria-label="Footer navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#lecturers">Lecturers</a>
          <a href="#students">Students</a>
        </nav>
      </div>
    </footer>
  );
}
