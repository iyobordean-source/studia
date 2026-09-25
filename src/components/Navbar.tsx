import { useRef, useState, type KeyboardEvent } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";

export default function Navbar() {
  const [menuOpen, setMenuOpen] = useState(false);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.key === "Escape" && menuOpen) {
      setMenuOpen(false);
      menuButtonRef.current?.focus();
    }
  }

  return (
    <header className="site-header" onKeyDown={handleKeyDown}>
      <div className="page-container mx-auto max-w-[1200px] nav-row">
        <a className="wordmark" href="/" aria-label="Studia home">
          <span>Stud</span><span className="wordmark-accent">ia</span>
        </a>

        <nav className="nav-links" aria-label="Main navigation">
          <a href="#how-it-works">How it works</a>
          <a href="#lecturers">For lecturers</a>
        </nav>

        <div className="nav-actions">
          <a className="nav-signin" href="/sign-in">
            Sign in
          </a>
          <a className="button button-small button-primary" href="/sign-up">
            Get started
            <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.8} />
          </a>
          <button
            className="mobile-menu-toggle"
            type="button"
            aria-label={menuOpen ? "Close navigation menu" : "Open navigation menu"}
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            onClick={() => setMenuOpen((open) => !open)}
            ref={menuButtonRef}
          >
            {menuOpen ? <X aria-hidden="true" size={19} /> : <Menu aria-hidden="true" size={19} />}
          </button>
        </div>
      </div>
      <nav
        id="mobile-navigation"
        className="mobile-nav-panel"
        aria-label="Mobile navigation"
        hidden={!menuOpen}
      >
        <a href="#how-it-works" onClick={() => setMenuOpen(false)}>How it works</a>
        <a href="#lecturers" onClick={() => setMenuOpen(false)}>For lecturers</a>
        <a href="#students" onClick={() => setMenuOpen(false)}>For students</a>
      </nav>
    </header>
  );
}
