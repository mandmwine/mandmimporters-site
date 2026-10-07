# UX checklist — working status

Full reference list: **UX_FULL_CHECKLIST.md** (37 sections, ~1400 items).

## Status against the full list

The sections below note what's shipped and what the next targets are.
Items marked (N/A) don't apply to a boutique wine catalog CMS (shopping
cart, booking engine, etc.) and can be ignored.

### 1. Search
- [x] Live, debounced search; Enter also submits; URL-backed state
- [x] Clear button inside each filter row
- [x] Keyboard shortcut (`/` or `Cmd+K`) jumps to global search
- [x] Suggestions dropdown (command palette)
- [x] Case / accent insensitive (Postgres `ILIKE`)
- [x] Result count shown ("130 vintage records · showing 1–50")
- [x] No results message with "Clear filters" next step
- [ ] Clear-X **inside** the search input (pass 3)
- [ ] Recent searches
- [ ] Matched text highlighting
- [ ] "Did you mean" / typo tolerance
- [ ] Create new from search term when nothing found

### 2. Filtering
- [x] Filter by status / country / completeness
- [x] Filter state in the URL
- [x] Instant apply (dropdowns)
- [x] Clear all filters
- [x] Click column value to filter (pass 3)
- [ ] Chips for each applied filter with × to remove (pass 3)
- [ ] Saved filter views
- [ ] Column header filter menu

### 3. Sorting
- [ ] Click column header to sort (pass 3)
- [ ] Arrow shows direction (pass 3)
- [ ] Sort kept in URL (pass 3)
- [ ] Numbers sort naturally (pass 3)
- [ ] Statuses sort in logical order (pass 3)

### 4. Pagination
- [x] First / Prev / Next / Last
- [x] Current page highlighted; disabled states muted
- [x] "Showing M of N"
- [ ] Items per page chooser (pass 3)
- [ ] Jump-to-page input (pass 3)
- [ ] Page number kept in URL (we have this; just mark it)
- [x] Returns to page 1 when filters change

### 5. Selection
- [x] Per-row checkbox with label
- [x] Header select-all (tri-state)
- [x] Selected count in action bar
- [x] Clear selection
- [x] Selection survives paging (SelectionProvider)
- [ ] Shift-click range selects
- [ ] Running total (sum of selected)

### 6. Bulk actions
- [x] Delete / archive / resolve / dismiss (per-feature)
- [x] Change kind in bulk (assets)
- [x] Confirmation with count ("Delete 14 assets?")
- [x] After action, selection clears
- [ ] Undo bulk action (pass 3 — Undo toast)
- [ ] Progress bar on long jobs

### 7. Tables
- [x] Click row to open (ClickableRow)
- [x] Hover + focus highlights
- [x] Status shown as colored badge
- [ ] Show/hide columns, column menu
- [ ] Drag to reorder columns
- [ ] Row density toggle
- [ ] Group by / subtotals

### 8. Views (list / grid / board)
- [N/A] Board / kanban — not relevant for this CMS
- [ ] Side-by-side compare on wines (already have /wines/[id]/compare)

### 9. Record detail pages
- [x] Breadcrumbs, title, status at top
- [x] Three-column workspace with jump links (wine edit)
- [x] Edit button / inline edit
- [x] Related records (producer → wines, catalog → wines)
- [ ] Prev / next record arrows (pass 3)
- [ ] Copy link to record (pass 3)
- [ ] Record ID visible + click-to-copy (pass 3)
- [ ] "Updated X ago by Y" (pass 3)
- [ ] "Open in new tab" button

### 10. Creating and editing
- [x] Add in a consistent place
- [x] Enter saves, Escape cancels
- [x] Autosave with ✓ Saved indicator
- [x] Autofocus first field
- [x] Pending state on buttons
- [ ] Save and add another (pass 3)
- [ ] Discard changes button
- [ ] Keyboard shortcut `N` for new (pass 3)
- [ ] Warning when someone else changed the record

### 11. Forms
- [x] Label above field
- [x] Help text under fields
- [x] Pending state on submit
- [x] Server errors shown inline
- [ ] Required-field markers (pass 3)
- [ ] First-field focus always
- [ ] Validation on blur, not on keystroke

### 12. Text fields
- [x] Textarea resize
- [x] Char counter + warn (tasting note)
- [x] Autosave for long text
- [ ] Clear × inside input (pass 3)
- [ ] Click-to-copy for IDs (pass 3)

### 13. Dates and numbers
- [x] Dates shown in local format
- [ ] "In 2 hours / 3 days ago" relative display (pass 3)

### 14. Dropdowns and pickers
- [x] Searchable in command palette
- [ ] Searchable dropdowns elsewhere (country picker is one)

### 15. Files, images, media
- [x] Drag and drop upload (pass 2)
- [x] Multiple files
- [x] Thumbnail previews
- [x] Rename / replace / delete
- [x] Allowed types + size stated
- [x] Low-resolution warning
- [ ] Crop + rotate in-place
- [ ] Paste image from clipboard

### 16. Buttons, menus and actions
- [x] One obvious main button per screen
- [x] Pending states, no double-submit
- [x] Danger buttons set apart
- [x] Shortcut keys shown in cheatsheet (pass 3)
- [x] Command palette
- [ ] Right-click menu

### 17. Delete, undo, safety nets
- [x] Confirmation names the exact item
- [x] Soft-delete (assets)
- [ ] Undo toast on destructive actions (pass 3)
- [ ] Trash with restore
- [ ] Session-timeout warning
- [ ] Drafts recovered on crash

### 18. Loading, empty, errors, success
- [x] Pending states on buttons
- [x] Centered empty states
- [x] Error messages in the form, not in alert()
- [ ] Skeleton rows during navigation (pass 3)
- [ ] Thin top progress bar

### 19. Notifications (deferred, user said no email alerts)
- [N/A] Email notifications off per user instruction

### 20. Navigation and wayfinding
- [x] Current page highlighted in sidebar
- [x] Breadcrumbs
- [x] Global search (Cmd+K)
- [x] Logo goes home (via "Catalog" brand)
- [ ] Shortcut cheatsheet (`?`) (pass 3)
- [ ] Back to top on long pages

### 21. Links / URLs / browser
- [x] Every page has its own URL
- [x] Filters in the URL
- [x] Browser back / forward work (Next.js default)
- [x] Copy link button (pass 3)

### 22. Keyboard
- [x] Esc closes
- [x] Cmd+K / `/` opens palette
- [x] Cmd+S saves panel in focus
- [ ] `N` opens new-vintage from a wine page (pass 3)
- [ ] `?` opens shortcut cheatsheet (pass 3)
- [ ] J / K navigates rows in a list (pass 3)
- [ ] G then letter navigation

### 23. Copy / export / import / print / share
- [x] Export CSV / Excel-equivalent (PDF per preset for catalogs)
- [x] Print layout (sheet mode=raw)
- [x] Shareable public URL per catalog (phase 10)
- [ ] Copy ID / copy link (pass 3)
- [ ] Export selected wines as CSV (pass 3)
- [ ] Clean print stylesheet for admin pages

### 24. Dashboards (already have the dashboard panel)
- [x] Dashboard key counts
- [x] Click any number → list behind it
- [ ] Date range selector on dashboard

### 25. Calendar
- [N/A] Not relevant for a wine catalog

### 26. Comments and collaboration
- [ ] Comments on wines (future)

### 27. History, audit, trust
- [x] audit_events table used by every write
- [ ] "Updated X ago by Y" surfaced in UI (pass 3)
- [ ] Version history view

### 28. Accounts / sign in / security
- [x] Sign in via Firebase (email+pw, Google)
- [x] Session cookie, remembered across tabs
- [ ] Session-timeout warning
- [ ] List of devices currently signed in (Firebase gives this)

### 29. Roles / permissions
- [x] Admin / Editor / Viewer roles
- [x] Per-feature gates (canEdit)
- [ ] View as other role (nice-to-have)

### 30. Personalization
- [x] Preview scale persisted (wine workspace)
- [x] Preview open/closed persisted
- [x] Review-queue selection cleared on action
- [ ] Dark mode toggle (pass 3)
- [ ] Reduced-motion respect (pass 3)
- [ ] Time zone / clock preference (America/New_York hardcoded for now)
- [ ] Items-per-page persisted (pass 3)

### 31. Onboarding / help / wording
- [x] Plain words, same name for each thing
- [x] Confirmations name the exact item
- [ ] First-time welcome screen
- [ ] Shortcut cheatsheet (`?`) (pass 3)

### 32. Shopping
- [N/A] Not a shop

### 33. Public pages
- [x] /share/catalog/[token] + /share/wine/[slug] (phase 10)

### 34. Mobile and touch
- [x] Responsive layout (workspace collapses rails)
- [ ] Swipe row to archive
- [ ] Bottom action bar for touch

### 35. Accessibility
- [x] Strong contrast
- [x] Keyboard focus visible
- [x] Alt text supported on assets (metadata.alt_text, phase 4)
- [x] Icon buttons have aria-labels
- [ ] Screen-reader announcements for autosave
- [ ] Reduced motion respect

### 36. Speed, offline, reliability
- [x] Changes appear instantly (optimistic refresh)
- [x] Search debounced
- [x] Big lists paged on the server
- [ ] Live refresh notice when a tab is stale
- [ ] Offline banner

### 37. Smart conveniences
- [x] Duplicates from previous vintage ("Copy from previous")
- [x] Autofill (bottle library)
- [x] AI drafts tasting notes, finds scores
- [ ] "Last value you used" remembered on New (pass 3)
- [ ] Rapid-entry mode (Save-and-add-another) (pass 3)
- [ ] Suggested next step after a task

---

## Pass 3 scope (shipping now)

1. **Sortable column headers** — wines, catalogs, producers, assets
2. **Prev / next record** on wine detail (arrows + J/K)
3. **Copy link / Copy ID** on wine, producer, catalog, asset, map detail
4. **Last updated by X, Y ago** on wine + producer detail
5. **Undo toast** for destructive single-row actions (remove catalog item, delete score, delete grape blend, resolve flag)
6. **Dark mode toggle** in the user menu, persisted
7. **Reduced motion** respect
8. **`?` shortcut cheatsheet overlay**
9. **Items-per-page chooser** (25 / 50 / 100 / All) on wines list
10. **Save and add another** for AddVintageButton
11. **Required-field markers** across forms
12. **Click producer in wine row** → filter wines by that producer
13. **"Last updated time"** indicator in header of workspace pages
