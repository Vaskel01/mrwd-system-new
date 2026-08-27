# Page help tooltips

The MRWD interface provides contextual **Page help** on every routed page.

## User behavior

- Authenticated pages show **Page help** in the top application bar.
- Public authentication pages show the same help control in the upper-right corner.
- Desktop users can hover or focus the control for quick help.
- Clicking the control keeps the help panel open until it is clicked again, Escape is pressed, or the user clicks outside it.
- Mobile users tap the help control to open or close it.

Each panel contains a one-sentence page purpose and a short list of practical tips. The goal is to help users understand what the page is for without turning the interface into a manual.

## Source files

- `src/components/ui/PageHelpTooltip.jsx` — shared accessible tooltip/popover behavior.
- `src/config/pageHelp.js` — route-specific help text.
- `src/components/layout/AppLayout.jsx` — authenticated-page placement.
- `src/App.jsx` — public authentication-page placement.

## Adding a new page

1. Add the route normally in `src/App.jsx`.
2. Add a matching entry in `src/config/pageHelp.js`.
3. Keep the summary to one sentence.
4. Add two to four task-focused tips.
5. Run `npm run check:source`.

The source-integrity check scans application routes and fails if a routed page does not have matching page help.

Follow `docs/CONTENT_STYLE_GUIDE.md` when writing or revising help text.
