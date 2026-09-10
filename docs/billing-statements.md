# Billing statement imports

The customer Billing page displays imported MRWD statement information. It does not read photographs, calculate tariffs, collect payments, or query the external MRWD billing system in real time.

Use the downloadable CSV template under Commercial Services → Billing import. Match each row to an official account number and billing period. Validate before importing; never use a customer's photographed statement as sample production data.

- The original eight columns remain supported.
- amount_due is the official amount on or before the due date, including any arrears already in that statement.
- Optional identification: bill_number, registered_name, service_address, account_type, meter_number, meter_size, service_period.
- Optional reading_date uses YYYY-MM-DD. Existing previous_reading/current_reading/consumption retain their existing import behavior (omitted readings default to zero).
- Optional amounts: water_charge, arrears, other_charges, meter_maintenance, pay_immediately, penalty, amount_after_due. Enter plain non-negative amounts with at most two decimals, no currency signs or thousands separators. Blank means unavailable, not zero.
- A complete four-charge breakdown must equal amount_due. If both penalty and amount_after_due are supplied, amount_after_due must equal amount_due + penalty. No rate is assumed.
- Expanded files replace the optional statement snapshot, so include every detail you want retained. Blank optional cells clear those values.
- Legacy eight-column reimports retain the snapshot if the amount, readings, consumption, and due date are unchanged (for example, updating status to paid). If those values change, stale optional details are cleared; reimport an expanded report to restore them.
- Existing rows are preserved by the additive migration. Customer access remains governed by the existing verified-account RLS policies.

Historical totals are deliberately not summed: a newer statement can include earlier arrears. The page labels values as statement amounts, not live balances. Paid statements still show the original statement amounts with their imported paid status. Pay-immediately figures are displayed separately, never added again. Payment channels, penalties, and disconnection rules must be confirmed with MRWD rather than inferred from a sample bill.

Deployment: apply the billing_statement_details migration before deploying the updated import API. The UI can display legacy rows without optional details.

Verification: npm run verify includes eight statement regression tests (75 automated tests total at this revision). Run node scripts/qa-billing.mjs against a local Vite server for synthetic-only browser checks; configure QA_PLAYWRIGHT_PATH and QA_BROWSER_PATH if using an external Playwright/Chrome installation. It covers desktop/tablet/mobile, light/dark, dialog focus, filtering, legacy/paid/empty/error states, and the downloadable CSV. Browser fixtures do not exercise a live authenticated import. Database validation was checked separately against the applied constraint function; RLS remains enabled.
