# Design direction

## Intended feel

Studia should feel premium, academic, intelligent, trustworthy, warm, and modern. Use a warm paper-inspired foundation, deep moss green as a key accent, refined neutrals, selective serif typography for editorial moments, and a clear sans-serif for application UI.

Avoid generic AI SaaS styling, excessive gradients, purple or blue AI clichés, glass effects, excessive cards, fake statistics, fake logos, and decoration without a purpose.

## Initial visual language

These values are a starting direction for future UI work, not a complete implemented design system.

### Colors

- **Paper:** `#F7F5EF` for the main background.
- **Warm white:** `#FCFBF7` for raised or readable surfaces.
- **Ink:** `#20261F` for primary text.
- **Moss:** `#365944` for primary actions and selected states.
- **Deep moss:** `#263F31` for strong emphasis and hover states.
- **Sage:** `#E6ECE3` for quiet supporting surfaces.
- **Muted neutral:** `#777B72` for secondary text.
- **Line:** `#DEDCD3` for subtle boundaries.
- **Status colors:** use restrained, accessible red, amber, and green tones with text labels; never rely on color alone.

Check contrast for actual foreground and background combinations as components are built.

### Typography

- Use a clean sans-serif stack for navigation, controls, tables, and most application text. Start with the system sans stack to avoid a remote font dependency.
- Use a restrained serif such as Georgia or a later selected editorial typeface for occasional page titles or academic emphasis.
- Keep body text comfortable to read; use hierarchy through size, weight, and spacing rather than decorative styling.

### Spacing and borders

- Use a consistent spacing rhythm based on small multiples, with generous page margins and denser spacing only for data-heavy regions.
- Prefer thin neutral borders and clear alignment over shadows and nested containers.
- Reserve rounded corners for controls and distinct surfaces; keep radii modest.

### Buttons and inputs

- Primary buttons use moss with clear action labels, visible focus, and accessible contrast.
- Secondary actions use quiet neutral or outlined treatments; destructive actions need an unmistakable but restrained warning treatment.
- Inputs should have persistent labels, clear boundaries, helpful validation, and visible keyboard focus. Placeholder text is not a label.

### Navigation and cards

- Keep navigation compact and make the current course or workspace clear.
- Use cards only when grouping related content improves scanning. Prefer page sections and typography over wrapping every item in a card.

### Tables and assessment UI

- Tables should be readable, aligned, and scannable, with clear column labels and restrained row separators. Support narrow screens without hiding important context.
- Assessment-taking screens should prioritise question readability, progress, and a clear distinction between answering and submitting. Avoid unnecessary distractions.

### Dashboards

- Lead with meaningful course or learning context and actionable information.
- Show real data only. Do not use invented statistics or decorative charts.

### Loading, empty, and error states

- Loading states should communicate what is being loaded and avoid unnecessary animation.
- Empty states should explain the next useful action without pretending that data exists.
- Error states should say what failed in plain language and provide a recovery path when one is available.

### Responsive behavior

- Design for small screens first where the task is linear, especially assessment taking.
- Let tables and navigation adapt deliberately on narrow screens; preserve essential actions and context.
- Test keyboard use, zoom, touch targets, and reduced-motion preferences as real screens are added.

The public landing page is the first implementation of this direction. It establishes the palette, editorial type, spacing, buttons, and static product previews; a complete design system remains future work.
