# UX checklist for the CMS

Working document.  Every new feature should be audited against this list
before shipping, and every old feature should be re-audited periodically.

## Tables with rows

- [ ] **Select-all checkbox** in the header, with an indeterminate state
      when some but not all rows are selected
- [ ] Per-row checkbox, keyboard focusable, with an accessible label
- [ ] Row click opens the primary detail link (not just a single cell)
- [ ] Sortable columns where it matters (producer, date, flags)
- [ ] Pagination controls with page count and "First / Prev / Next / Last"
- [ ] "N results" shown in the header
- [ ] Empty state with a clear next action
- [ ] Loading state (skeleton rows) during async refresh
- [ ] Keyboard: `j` / `k` or arrow keys to move between rows (nice-to-have)

## Forms and edit panels

- [ ] First field is autofocused when the panel opens
- [ ] `Enter` in the form submits (unless multi-line)
- [ ] `Esc` cancels and closes the panel
- [ ] Required fields are marked and validated inline
- [ ] Buttons show a pending state (never let the user double-submit)
- [ ] After save, a short inline confirmation (not a full-page toast)
- [ ] Unsaved-changes warning before navigation away (nice-to-have)
- [ ] Server errors are shown in the form, not in an alert

## Dialogs / modals

- [ ] `Esc` closes
- [ ] Click on the backdrop closes
- [ ] Focus is trapped inside while open
- [ ] First actionable element is autofocused on open
- [ ] Returns focus to the opener on close

## Filters and search

- [ ] Live, debounced search — no "Filter" button required for a single input
- [ ] Clear button when any filter is active
- [ ] Filter state in the URL so it survives refresh and share
- [ ] Chip for each applied filter, click to remove
- [ ] Count of matching rows always visible

## Bulk actions

- [ ] Select-all-on-page and select-all-matching-filter
- [ ] Clear selection
- [ ] Action bar sticks to viewport when any row is selected
- [ ] Destructive actions require confirmation
- [ ] After the action completes, selection clears

## Destructive actions

- [ ] Inline confirmation (two-click), not a `window.confirm()`
- [ ] Explain what will be deleted and what it affects
- [ ] Say when a soft-delete can be undone and for how long

## Navigation

- [ ] Breadcrumbs for every page nested below a top-level nav item
- [ ] "Back to X" link in the header, not browser back
- [ ] Current nav item highlighted in the sidebar
- [ ] Cmd+K opens a global search / command palette (nice-to-have)

## Images and files

- [ ] Drag-and-drop upload, not only a file picker
- [ ] Visible progress during upload
- [ ] Resolution and size shown next to the image
- [ ] Replace-in-place, not just add-and-delete
- [ ] "Choose from library" when something was uploaded before

## Keyboard shortcuts (CMS-wide)

- [ ] `Esc` closes dialogs and edit panels
- [ ] `/` or `Cmd+K` focuses the main search
- [ ] `Cmd+S` saves whichever panel the focus is in
- [ ] Shortcut cheatsheet (`?`) — nice-to-have

## Feedback and status

- [ ] After every write the page re-renders with the new state
- [ ] Server actions show a pending state locally
- [ ] Errors never silently swallow — always surfaced in the form
- [ ] Loading states for anything that takes >200 ms
