# UI consistency audit

Audit completed on 2026-08-31 against every routed UI surface and the shared components that define their layout. The findings below are grouped by user impact. Each item records the original inconsistency and the applied fix.

## Breaks layout or task completion

| File or component | Inconsistency found | Fix applied |
| --- | --- | --- |
| `src/index.css`, `MaintenanceReportPage` | The print rule hid every `header`, including the official header inside a maintenance report. Printed reports could lose their identity block. | Scoped print hiding to application chrome (`.app-topbar`, app sidebar, app footer, and `.no-print`) and kept the report article explicitly white and printable. |
| `AnalyticsPrimitives`, `MaintenanceTasksPage`, `SystemStaffAccountsPage`, `SystemAuditLogPage`, `CommercialComplaintReviewPage`, `EcmdDispatchPage`, `BillingPage` | Tables used different header padding, font color, vertical alignment, and column behavior. Dense tables compressed labels and action buttons, while some headers became low contrast in dark mode. | Added one `data-table` contract: fixed column geometry, 12 px uppercase headers, consistent 12/16 px cell padding, top-aligned body cells, wrapping data, and non-wrapping actions. Existing mobile card layouts remain the small-screen presentation; analytics tables get a contained 720 px minimum instead of overflowing the page. |
| `SearchField`, `SavedViewsBar`, `Pagination`, staff filter toolbars | Global control sizing made controls declared as 36–40 px render at 44 px, while adjacent fields rendered at 56 px. Clear and Refresh actions did not align with their filter rows. | Defined 44 px compact controls, 56 px fields, and a 56 px `filter-action`. Applied the same heights to saved views, pagination, Clear, and Refresh actions. |
| `SavedViewsBar` | A hard 220 px minimum plus the select and action could pressure or overflow narrow cards. | Made both groups `min-w-0`, full-width on mobile, and auto/flexible from 640 px. The name input is now the shared compact height. |
| `PriorityBadge`, `StatusBadge`, dispatch and task tables | Priority/status labels did not share geometry; the Medium badge could wrap into a narrow column and appear squashed. | All badges now use one pill shape, 12 px type, consistent padding/line-height, and semantic variants. Priority badges stay on one line and keep their intrinsic width. |

## Visually jarring inconsistencies

| File or component | Inconsistency found | Fix applied |
| --- | --- | --- |
| `PageHeader` and the manual headers in customer, commercial, ECMD, system, maintenance, and shared pages | Equivalent page headers alternated among 24/28/32 px radii, 20/24/32 px horizontal padding, and different title weights and line-heights. | Added the shared `page-header` contract and applied it to every in-app page header: 32 px desktop radius, 24 px mobile radius, 20/24 px horizontal padding, 24/30 px title size, and a consistent 1.2 title line-height. |
| `BillingPage`, `AnnouncementsPage`, `SubmitComplaintPage`, `index.css` | These pages rendered a page-level pseudo wave and a second inline SVG wave. Placement and scale differed from every other module. | Removed the duplicate inline decorations. Page headers now use one 76 px wave at a -10 px offset. Dialog waves and sidebar waves have dedicated 60 px and 120 px scales. |
| `MetricCard`, `AnalyticsKpi` | Dashboard metrics used 24 px versus 16/20 px padding, 48 px circular versus 40 px rounded-square icon containers, and different number line-height. | Standardized cards to 16 px mobile/20 px desktop padding, 40 px icon containers with 20 px icons, and tight aligned metric numerals. |
| `Badges.jsx`, `index.css` | Forwarded, awaiting verification, rejected, cancelled, and blocked states were long inline class strings with inconsistent shapes and incomplete dark-theme states. | Added semantic badge classes for every supported state and explicit accessible dark-theme foreground, border, and background tokens. |
| `MyComplaintsPage`, `ComplaintOperationsMap`, `InlineMap`, `SubmitComplaintPage` | Complaint status colors and map pins were defined independently, so the same status could use different colors between a list and map. | Added `src/config/uiTokens.js` as the shared status and map-marker source and consumed it across lists and maps. |
| `Dialog` | Dialogs used page-wave scale, mixed inner padding, a 40 px close control that rendered differently under global button sizing, and duplicated literal radii. | Added dialog surface/header tokens, a smaller dialog wave, responsive 16/24 px content padding, and a 44 px circular close target. |
| `NotificationsPage`, shared empty states | Notifications used a one-off 48 px empty-state icon/card and a dismiss action without a stable square hit area. | Reused `EmptyState` with the shared 40 px icon scale and gave Dismiss a 44 × 44 px circular target. |
| `AppLayout` | Sidebar width and main offset were split between inline pixel styles and Tailwind classes; gold decorative values were also duplicated inline. | Kept the 240 px sidebar and main grid in shared classes and replaced decorative inline colors with existing navy/gold tokens. |
| Light yellow/amber actions and dark-mode filter states | Several light buttons inherited white text, and raw orange/gold utilities did not have complete dark-mode behavior. | Moved warning actions to the amber semantic palette with navy/amber foregrounds and replaced raw inline gold values with shared token classes. Active filters continue to use their action-button color rather than pure white. |

## Minor polish and maintainability

| File or component | Inconsistency found | Fix applied |
| --- | --- | --- |
| All JSX UI files, `scripts/check-source.mjs` | Compact labels mixed an 11 px utility with 12 px labels for the same semantic role. A CSS shim hid the inconsistency without fixing the source. | Migrated all 11 px labels to `text-xs`, removed the shim, and extended the source check to reject 9/10/11 px UI text. |
| `tailwind.config.js` | The sans stack referenced Inter although Inter was not loaded, causing environment-dependent fallback rendering. | Replaced it with the actual system UI stack while retaining Plus Jakarta Sans for display roles. |
| `BillingPage`, `MyComplaintsPage`, `SubmitComplaintPage`, `CommercialExportCenterPage` | Page sections alternated between 20 and 24 px vertical gaps without a semantic reason. | Standardized top-level page stacks to 20 px (`space-y-5`). |
| Auth pages | Public page backgrounds used a literal light color while the application already exposed a light/dark background token. | Replaced the literal with `bg-md-background`; verified the dark surface, card, and input tokens. |
| `Pagination` | Previous/next buttons and the page-size select used different declared heights and radii. | Standardized all pagination targets to 44 px and circular navigation buttons. |
| `SubmitComplaintPage` | Wizard steps declared 40 px controls despite the 44 px touch-target baseline, and Continue had an inline 8 px radius that overrode the shared button. | Set steps to a 44 px minimum with the shared rounded scale and removed the inline button radius. |
| Empty states across billing, announcements, dashboards, staff accounts, advisories, feedback, task and complaint pages | Equivalent empty-state icons ranged from 40 to 48 px. | Standardized empty-state illustrations to 40 px; inline action icons remain 16 or 20 px according to their container. |

## Shared sizing contract after the fixes

| Role | Token or rule |
| --- | --- |
| Spacing | 4, 8, 12, 16, 20, 24, and 32 px scale; page stacks and normal card padding use 20 px. |
| Typography | Supporting/metadata text starts at 12 px; body and controls use 14 px; page titles use 24 px mobile and 30 px from 640 px. |
| Controls | Compact buttons/selects and icon targets: 44 px; form fields and filter-row actions: 56 px. |
| Corners | Page bands: 32 px desktop/24 px mobile; cards: 24 px desktop/20 px mobile; dialogs: 28 px. |
| Icons | Inline icons: 16 px; normal action/card icons: 20 px; empty-state illustrations: 40 px. |
| Waves | Page header: 76 px high at -10 px; dialog: 60 px at -12 px; sidebar: 120 px at bottom; auth brand artwork: a deliberate 31% layered composition. |
| Responsive behavior | Mobile below 640 px, tablet from 640 px, persistent sidebar at 1024 px. Dense operational tables retain their established mobile-card alternatives; scroll-contained analytics tables keep readable columns. |

## Page-by-page coverage

| Module | Pages/components reviewed | Result |
| --- | --- | --- |
| Authentication | Login, Register, Forgot Password, Reset Password, MFA, `AuthBrandPanel` | Public layouts checked at 1280 × 800, 768 × 900, and 390 × 844. No horizontal overflow; visible form controls are at least 44 px high. MFA redirects to sign-in without an authenticated challenge, so its component received source-level sizing review. |
| Customer | Submit Complaint, My Complaints, Billing, Announcements | Header/wave, wizard, filter, cards, maps, empty states, responsive list/table, dark palette, and page gaps standardized. |
| Commercial Services | Dashboard, Complaint Review, Reports, Accounts & Billing, Service Advisories, Export Center | Analytics primitives, report tables, filter actions, status tokens, headers, and responsive table/card presentation standardized. Dashboard and Accounts & Billing inherit the audited shared components. |
| ECMD | Dashboard, Dispatch, Field Operations, Crew Management, Availability | Header grid, dispatch table/actions, priority badges, staff cards, and responsive layouts standardized. Dashboard inherits the audited department analytics primitives. |
| System Supervisor | Dashboard, Departments & Access, Staff Accounts, Audit Log, Announcements, System Health | Tables, filter actions, headers, empty states, icons, and token colors standardized. Departments & Access inherits the audited operations workspace. |
| Maintenance | Tasks, Announcements, Maintenance Report | Task table/actions, priority/status badges, announcements presentation, and report print behavior standardized. |
| Shared shell and pages | `AppLayout`, Profile, Notifications, Complaint Details, `Dialog`, `PageHeader`, `MetricCard`, `Pagination`, `SavedViewsBar`, map components | Sidebar/topbar alignment, account controls, shared geometry, theme states, and responsive behavior standardized at their source. |

## Verification

- `npm run check:source`: passed (166 files scanned).
- `npm run lint`: passed.
- `npm run build`: passed.
- Browser audit: no horizontal overflow at desktop, tablet, or 390 px mobile widths on public surfaces; no visible button/input/select/textarea below the 44 px interaction baseline.
- Mobile dark-theme visual check: passed with tokenized body, card, input, button, and text contrast; browser console contained no errors.
- Protected pages were audited component-by-component in source because this local verification session did not include a real authenticated account.
