# MRWD UI Content Style Guide

This guide keeps the MRWD Complaint System easy to scan and understand across Customer, Commercial Services, ECMD, Maintenance Personnel, and System Administration screens.

## 1. Write for the task

Tell people what they can do, what happened, or what they need to do next.

Prefer:
- **Review complaints**
- **Send to WDLCD**
- **Choose Maintenance Personnel**
- **Waiting for WDLCD verification**

Avoid implementation language such as:
- operational owner
- classifier recommendation
- generated run archive
- payload
- RPC
- governance action

Technical terms may remain in developer documentation, logs, or diagnostics when they are necessary for troubleshooting.

## 2. Use sentence case

Use sentence case for page titles, section headings, navigation labels, buttons, field labels, and empty-state titles.

Examples:
- `Staff accounts`
- `Complaint review`
- `Save schedule`
- `Reason for change`

Keep official names and role names capitalized:
- Metro Roxas Water District
- Commercial Services Department
- ECMD
- Maintenance Personnel
- System Supervisor

## 3. Page hierarchy

A normal page should read in this order:

1. **Workspace or department** — short eyebrow text when useful.
2. **Page title** — names the task or content.
3. **One-sentence description** — explains what the user can do on the page.
4. **Primary controls** — search, filters, or the main action.
5. **Content sections** — each with a clear heading and optional one-sentence helper.

Do not add a separate card that only repeats the page title or description.

## 4. Forms

Every field should have a visible label. A placeholder is an example or hint, not a replacement for the label.

Good:

- **Search**
  - Placeholder: `Reference, complaint type, address, or customer`
- **Reason for change**
  - Placeholder: `Explain why this complaint needs a different priority.`

Use `*` only when a required field needs extra emphasis. The interface should also enforce the requirement programmatically.

## 5. Buttons

Use a verb that describes the result of the action.

Prefer:
- `Save changes`
- `Send to WDLCD`
- `Assign Maintenance Personnel`
- `Mark field work complete`
- `Verify and resolve`
- `Clear filters`

Avoid vague buttons such as:
- `Submit` when a more specific action is available
- `Proceed`
- `OK`
- `Action`

Use a question in confirmation-dialog headings when the action has a meaningful consequence, for example `Deactivate staff account?`.

## 6. Statuses

Statuses should describe the current state, not an internal event name.

Recommended complaint status language:
- Pending review
- Sent to WDLCD
- Assigned
- In progress
- Needs attention
- Waiting for WDLCD verification
- Resolved
- Rejected
- Cancelled

Reserve **Resolved** for complaints that ECMD has verified.

## 7. Automated priority language

Present automatic analysis as a suggestion, not as a decision made by the system.

Use:
- Automatic complaint analysis
- Suggested complaint type
- Suggested priority
- Priority score
- Type match confidence
- Urgency check
- See why this was suggested

Do not expose formula components, internal model/version names, or implementation terminology unless a specific administrative troubleshooting screen requires them.

## 8. Empty states

An empty state should answer two questions:

1. What is missing?
2. What happens next or what can the user do?

Example:

**No complaints yet**

Complaints you submit will appear here. Use **Submit a complaint** when you need to report a water service problem.

## 9. Success and error messages

Success messages should confirm the result in plain language.

Prefer:
- `Complaint sent to WDLCD.`
- `Priority changed and recorded in the activity log.`
- `Customer account list imported.`

Errors should say what went wrong and, when possible, how to fix it.

Prefer:
- `Choose a reassignment reason before changing personnel.`

Avoid:
- raw database errors
- stack traces
- internal field names
- unexplained error codes

## 10. Dates, counts, and names

- Use Philippine-friendly readable dates for user-facing timestamps.
- Use `1 complaint` and `2 complaints` rather than `2 complaint(s)` in new copy.
- Use full role names when the distinction matters.
- Use `people`, `crew size`, and `work hours` in the UI instead of `manpower` when possible. Database field names do not need to change.

## 11. Readability and spacing

- Keep explanatory paragraphs short, usually one or two sentences.
- Aim for about 60–75 characters per line for explanatory copy.
- Put helper text directly under the heading or field it explains.
- Separate unrelated tasks into sections instead of stacking dense controls in one card.
- Keep field labels in normal case rather than small all-caps text.
- Use all-caps sparingly for compact status badges or short department eyebrows.

## 12. Before adding new UI text

Check that the copy:

- uses plain words;
- tells the user what to do or what happened;
- does not expose implementation details;
- follows sentence case;
- uses the same MRWD term used elsewhere;
- gives a visible label to every form field;
- makes the next action clear;
- remains understandable without reading another page.

## 13. Page help tooltips

Every routed page should have contextual help in `src/config/pageHelp.js`. The shared **Page help** control displays this content in the application top bar and on public authentication pages.

Each page-help entry should contain:

- a short page title;
- one sentence explaining the purpose of the page;
- two to four practical tips focused on user decisions or common mistakes.

Keep page help task-focused. Do not repeat every button on the page or describe database/API behavior unless the user genuinely needs that information to make a safe decision.

The source-integrity check verifies that routed pages have a matching page-help entry, so new pages should add their help copy before they are merged.
