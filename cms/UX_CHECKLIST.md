# UX checklist for the CMS

Working document.  Every new feature should be audited against this list
before shipping, and every old feature should be re-audited periodically.

## Tables with rows

- [x] **Select-all checkbox** in the header, with an indeterminate state
      when some but not all rows are selected
- [x] Per-row checkbox, keyboard focusable, with an accessible label
- [x] Row click opens the primary detail link (not just a single cell)
- [ ] Sortable columns where it matters (producer, date, flags)
- [x] Pagination controls with page count and "First / Prev / Next / Last"
- [x] "N results" shown in the header
- [x] Empty state with a clear next action
- [ ] Loading state (skeleton rows) during async refresh
- [ ] Keyboard: `j` / `k` or arrow keys to move between rows (nice-to-have)

## Forms and edit panels

- [x] First field is autofocused when the panel opens
- [ ] `Enter` in the form submits (unless multi-line)
- [x] `Esc` cancels and closes the panel
- [ ] Required fields are marked and validated inline
- [x] Buttons show a pending state (never let the user double-submit)
- [x] After save, a short inline confirmation (not a full-page toast)
- [ ] Unsaved-changes warning before navigation away (nice-to-have)
- [x] Server errors are shown in the form, not in an alert

## Dialogs / modals

- [x] `Esc` closes
- [x] Click on the backdrop closes (AI dialog, command palette)
- [ ] Focus is trapped inside while open
- [x] First actionable element is autofocused on open
- [ ] Returns focus to the opener on close

## Filters and search

- [x] Live, debounced search — no "Filter" button required for a single input
- [x] Clear button when any filter is active
- [x] Filter state in the URL so it survives refresh and share
- [ ] Chip for each applied filter, click to remove
- [x] Count of matching rows always visible

## Bulk actions

- [x] Select-all-on-page and select-all-matching-filter
- [x] Clear selection
- [x] Action bar sticks to viewport when any row is selected
- [x] Destructive actions require confirmation
- [x] After the action completes, selection clears

## Destructive actions

- [x] Inline confirmation (two-click), not a `window.confirm()`
- [x] Explain what will be deleted and what it affects
- [x] Say when a soft-delete can be undone and for how long

## Navigation

- [x] Breadcrumbs for every page nested below a top-level nav item
- [x] "Back to X" link in the header, not browser back
- [x] Current nav item highlighted in the sidebar
- [x] Cmd+K opens a global search / command palette

## Images and files

- [x] Drag-and-drop upload, not only a file picker
- [x] Visible progress during upload
- [x] Resolution and size shown next to the image
- [x] Replace-in-place, not just add-and-delete
- [x] "Choose from library" when something was uploaded before

## Keyboard shortcuts (CMS-wide)

- [x] `Esc` closes dialogs and edit panels
- [x] `/` or `Cmd+K` focuses the main search
- [x] `Cmd+S` saves whichever panel the focus is in
- [ ] Shortcut cheatsheet (`?`) — nice-to-have

## Feedback and status

- [x] After every write the page re-renders with the new state
- [x] Server actions show a pending state locally
- [x] Errors never silently swallow — always surfaced in the form
- [x] Loading states for anything that takes >200 ms

## Drag reorder

- [x] Catalog sections drag-to-reorder (with keyboard-navigable fallback)
- [x] Catalog items drag-to-reorder
- [ ] Reordering falls back to buttons when drag isn't supported (touch)

## Autosave

- [x] Long-text wine fields autosave on debounced blur (tasting note,
      food pairing, wine story)
- [x] Status indicator: Typing… / Saving… / ✓ Saved / Error
- [ ] Autosave for producer long-text fields
- [ ] "Last saved X seconds ago" global page footer
