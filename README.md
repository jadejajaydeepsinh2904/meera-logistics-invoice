# Meera Logistics TransportBook-Style ERP

This is the complete root project for:

- Vercel frontend from `public/`
- Cloudflare Worker backend from `worker/`
- Cloudflare D1 database ID already configured
- Worker URL already configured in frontend

## Temporary Login

Username: `admin`  
Password: `Meera@2026`

## GitHub root structure

- `public/`
- `worker/`
- `vercel.json`
- `README.md`
- `START-HERE.txt`

## Cloudflare build configuration

Build command:

`cd worker && npm install`

Deploy command:

`cd worker && npx wrangler deploy`

Path:

`/`

## Vercel

Framework: Other  
Build command: empty  
Output directory: `public`

## Included modules

- TransportBook-style Dashboard
- Transport Khata / Trips
- Invoice Desk with multi-line GST invoice
- Party Khata and Party Payments
- Supplier Khata
- Truck / Supplier payable entries
- Supplier payment history
- Truck Master
- Online truck document upload
- Party, Route and Material masters
- Office Expenses
- Profit report
- Audit warnings and change history
- JSON backup and restore
- Invoice CSV export
- Print / Save as PDF
- WhatsApp invoice share
- Mobile and desktop responsive design
- Existing exported business data auto-imported once

## Database

D1 ID: `bdb1ef72-c3eb-465e-ae2d-853d63f3dea3`

Database schema and seed data are created automatically when the Worker starts.


## V2 D1 compatibility
The old D1 database is upgraded using constant defaults supported by SQLite/D1.
Missing route and truck-document columns are also added automatically.
Existing users and business data are preserved.


## V3 Vercel configuration fix

`vercel.json` now uses only:
- `$schema`
- `outputDirectory`
- `cleanUrls`
- `headers`

The rejected `public` property has been removed. Keep the Vercel Root Directory
at the repository root. The output directory is configured as `public`.


## V4 invoice reference update
- Invoice layout now matches the supplied ML-123 reference: logo, company details, Bill To block, right-side weights, blue truck table, comments, GST totals, stamp and signatures.
- Invoice list includes Edit, View and Download PDF actions.
- One invoice supports multiple trucks with Add Another Truck.
- Each truck line stores loading weight, unloading weight, shortage, billable weight, rate and total.


## Visual verification
The invoice template was rendered as A4 landscape with two trucks and verified to fit on one page without clipping.


V5 DROPDOWN UPDATE
- Party dropdown with + Add New Party
- Truck dropdown with + Add New Truck
- Loading Point dropdown with + Add New Route
- Unloading Point dropdown with + Add New Route
- Material dropdown with + Add New Material
- Same dropdown behavior in Trip, Invoice, Party Payment, Truck Entry, Supplier Payment and Documents.
- Invoice truck lines also include Truck dropdown and + Add New Truck.


V6 SPEED UPDATE
- Login uses a fast database path and no longer repeats the full D1 schema setup.
- The dashboard opens immediately from a safe local cache, then refreshes online.
- Static JavaScript/CSS files use long browser caching.
- API requests have a clear timeout instead of appearing frozen.
- Existing online data, D1 database and login remain unchanged.


V7 INVOICE LAYOUT FIX
- Removed the negative Bill To overlap.
- Bill To now stays in a clean left column.
- Invoice summary stays aligned on the right.
- Truck table widths are balanced.
- Comments and totals align correctly.
- Signature and stamp stay at the bottom.
- Preview scales automatically for desktop and mobile.
- A4 landscape print/PDF layout is fixed.


V8 INVOICE BOUNDARY FIX
- Fixed the real overlap cause: the global table min-width was forcing invoice tables outside the border.
- Every invoice table now has min-width 0 and stays inside the blue square.
- Bill To, right summary, truck table, comments and totals cannot cross the invoice boundary.
- Desktop/mobile preview scales without changing internal table widths.
- A4 landscape PDF/print remains inside one page.


V9 TRIP DETAILS
- Trip ID and View button now open a full Trip Details screen.
- Party tab: freight, bill, payments and pending balance.
- Profit tab: revenue, supplier cost, expenses and trip profit.
- Supplier tab: truck hire cost, supplier payments and pending payable.
- More tab: Bilty/LR and POD actions.
- Mobile layout follows the supplied TransportBook reference.


V10 CLICK AND CACHE FIX
- New Trip, New Invoice, Receive Payment and Pay Supplier now use reliable event delegation.
- Fixed stale Vercel/browser cache that kept old app.js after deployment.
- app.js and styles.css now use versioned URLs.
- Removed one-year immutable caching from /src files.
- All action buttons are touch-friendly and work on desktop/mobile.


V11 NULL + TRIP-IN-INVOICE FIX
- Fixed: Cannot read properties of null (reading 'id').
- New Trip and New Invoice now open correctly.
- All new/edit forms are null-safe.
- New Invoice includes + New Trip.
- Saving that trip automatically adds it as a truck line.
- Party, material, truck, route, loading/unloading weight and rate are copied.
- Frontend cache updated to v11.


V12 UNIVERSAL TRIP
- Trip is now the central universal record.
- Create Invoice directly inside Trip Details.
- Party Payment is saved against the selected Trip.
- Supplier Payment is saved against the selected Trip.
- Expenses are saved against the selected Trip.
- Profit, party pending and supplier pending are calculated only from that Trip.
- One Trip now connects Party, Invoice, Supplier, Payments, Expenses, Profit, POD and Bilty.
- Changes automatically apply in Party Khata, Supplier Khata, Invoice Desk and Reports.


V13 VISIBLE TRIP SCREEN
- Open Trip now shows the full Trip Details screen immediately.
- Party tab: Create/View Bill, party payment and pending balance.
- Profit tab: revenue, truck hire cost, expenses and profit.
- Supplier tab: supplier payment and pending payable.
- More tab: Bilty/LR and POD actions.
- UI matches the four TransportBook reference screenshots.
- Frontend cache updated to v13 so the new screen must load.


V14 D1 TRIP_ID FIX
- Fixed D1_ERROR: no such column: trip_id.
- Adds trip_id to party_payments, supplier_payments and expenses automatically.
- Does not trust an old schema_version unless all required columns are verified.
- Existing login, invoices, trips, payments and other data are preserved.
- No SQL Console command is required.


V15 TRIP INVOICE GST UNIVERSAL
- New/Edit Trip now contains Invoice Number, Invoice Date, Party GST, LR No, SGST and CGST.
- Saving the Trip can create or update its Invoice automatically.
- Entering an existing Invoice Number adds this Trip's truck to that same multi-truck invoice.
- Trip screen visibly shows Invoice Number, GST, LR and Invoice Total.
- Supplier rate, commission and advance are also saved from the same Universal Trip form.
- Multiple POD images can be selected in the Trip form.


V16 PARTY AUTO-FILL & LOCK
- Selecting Party automatically fills GST Number and Address.
- GST Number and Address are readonly in Universal Trip and Invoice forms.
- Edit GST/Address only from Party Master.
- Quick Add Party also fills and locks both values.


V17 INVOICE SERIES
- New invoice number is generated after the highest existing invoice number.
- The actual series/prefix is preserved automatically.
- Examples: ML - 123 -> ML - 124, ML-009 -> ML-010.
- Invoice Number remains fully editable before saving.
- Duplicate invoice numbers are still blocked by the database.


V18 FINAL CHECKED
- Fixed Party GST/Address disappearing after Party selection.
- Party details now come from Party Master, with latest Invoice fallback for older data.
- Old D1 Party rows with blank GST/Address are automatically backfilled from invoices.
- GST and Address remain readonly; edit them only in Party Master.
- Cache version updated to v18.
- JavaScript syntax, JSON configuration and old-D1 upgrade were validated.


V19 FORMS - TDS DECLARATION
- Added Forms section.
- Party dropdown auto-fills payer address.
- Preview and PDF download included.


V20 PARTY INVOICE + SERIES
- Party Khata now shows invoice number, date, trucks/routes, bill, received, pending and status.
- View, Edit, PDF and Delete are available from Party Khata and Party Ledger.
- Dashboard Party Outstanding shows the latest invoice number.
- Invoice Desk is sorted series-wise.
- New invoice number continues after the highest number in the current series.
- Invoice number remains editable.


V21 TDS PARTNERSHIP
- Removed Jaydeepsinh personal/proprietor auto-fill.
- Default entity is Partnership Firm.
- Meera Logistics firm details auto-fill by default.
- Firm name, address, PAN, GST, phone, email and authorized partner are editable.
- Declaration wording is partnership-based.


V22 PM NON-GST BILLS
- Added a separate PM Non-GST Bills section.
- Bill number series starts from PM - 1 and continues automatically.
- Bill number remains editable.
- Party, address, supplier, truck, route, weight, party rate and supplier rate are included.
- History includes View, Edit, PDF and Delete.
- Party billing, supplier payable and PM profit are shown in the same section.


V23 PM SUPPLIER LINK
- PM bill supplier uses the same Supplier/Truck Malik names as Supplier Khata.
- PM supplier payable is added automatically to Supplier Khata.
- PM bills appear inside the selected supplier ledger.
- Supplier pending = freight payable + PM payable - supplier payments.
- PM bills can be viewed, edited and downloaded from Supplier Khata.


V24 JAY NON-GST INVOICE
- Non-GST invoice is integrated into the existing Invoice Desk.
- New Invoice has GST / NON_GST type selection.
- GST series continues as ML.
- Non-GST series starts JAY 001 and continues automatically.
- Invoice number remains editable.
- Both types save in Party Khata, Supplier Khata, Outstanding and history.
- GST fields and GST amount are disabled for NON_GST invoices.
- Separate PM section is removed from navigation to avoid duplicate accounting.


V25 NON-GST VISIBLE FIX
- New Invoice visibly shows GST Invoice and Non-GST Invoice buttons at the top.
- Non-GST selection switches invoice series to JAY 001.
- GST fields and GST summary hide immediately.
- GST amount becomes zero.
- Switching back to GST restores ML series and GST fields.
- New Invoice screen was rebuilt to guarantee visible behavior.


V26 TRIP GST / NON-GST
- New/Edit Trip visibly shows GST Trip and Non-GST Trip buttons.
- GST Trip creates/updates ML-series GST invoice.
- Non-GST Trip creates/updates JAY-series invoice.
- Party GST, SGST and CGST hide for Non-GST Trip.
- GST values are zero for Non-GST Trip.
- Trip Type and linked Invoice Type always remain the same.


V30 CORE FINAL
- Every invoice truck line creates one separate TR-series trip.
- Existing invoice lines are migrated to missing trips automatically.
- Old trips receive permanent TR 001, TR 002... numbers.
- Invoice edit/add/delete synchronizes linked trip history.
- Trip edit/delete synchronizes the linked invoice line and totals.
- Supplier ledger numbers use permanent PML 001, PML 002... identities.
- Party and Supplier Ledgers include View, PDF/Print, Excel-compatible XLS and WhatsApp.
- Universal Search supports ML/JAY invoice, TR trip, PML supplier, party and truck.
- TDS declaration includes the Meera Logistics digital stamp.


V31 LOGIN ALTER FIX
- Fixed login crash: "ALTER TABLE invoice_items ADD COLUMN shortage REAL DEFAULT 0" is not a function.
- Cause was a missing comma between D1 migration template strings.
- CREATE TABLE, ALTER TABLE and CREATE INDEX arrays were normalized and syntax-checked.
- Existing D1 data is preserved.


V32 MIGRATION RUNTIME FIX
- Fixed: "CREATE INDEX IF NOT EXISTS idx_expense_trip ON expenses(trip_id)" is not a function.
- Audited CREATE TABLE, ALTER TABLE, CREATE INDEX and CREATE TRIGGER arrays for missing commas.
- Added a runtime Worker health test with a mock D1 database, not only a syntax check.
- Existing D1 records are preserved.


V33 TRIP NUMBER IDEMPOTENT FIX
- Fixed D1 UNIQUE constraint failed: trips.trip_no.
- Blank, invalid and duplicate old Trip numbers are normalized once.
- Missing invoice Trips are created only when no invoice_item_id or trip_id link exists.
- Trip number allocation retries safely on UNIQUE collisions.
- Historical repair does not replay on every successful login.
- Existing data is preserved.


V34 TRIP UNIQUE MIGRATION FIX
- Fixed repeated D1 UNIQUE constraint failed: trips.trip_no.
- Drops the old named TR unique index before repairing legacy rows.
- Blank and duplicate legacy trip numbers are temporarily stored as NULL.
- TR 001, TR 002... are assigned first; the partial unique index is created afterward.
- Fresh databases no longer use trip_no UNIQUE DEFAULT ''.
- Seed Trips explicitly use NULL until TR numbering is assigned.
- Existing invoices, trips, payments and ledgers are preserved.


V35 LR & WEIGHT LINES
- Login migration/version is unchanged.
- LR Number is now stored separately for every Truck line.
- Removed the Manual Trip dropdown; linked lines show TR series, new lines show AUTO.
- Invoice and Trip both include Loading Weight, Unloading Weight, Difference/Shortage and Billing Weight.
- Difference is calculated automatically.
- Billing Weight remains editable and is used for Amount calculation.
- Every Invoice line synchronizes these values to its linked Trip.
- Operational columns are added lazily only when Trip/Invoice is used, not during login.


V36 REFERENCE INVOICE LAYER
- Added reference-matched Invoice View/Print/PDF without modifying login, app core or Worker backend.
- Per-truck LR Number, TR Number, loading/unloading/difference/billing weights, rate and amount are printed line-wise.
- Invoice WhatsApp and CSV export use line-wise LR/truck details.


V37 A4 INVOICE LAYOUT FIX
- Login, D1 migration and Worker backend are unchanged.
- Removed Trip Number and LR Number columns from the truck table.
- LR numbers remain in the invoice summary.
- Compact truck table follows the original reference layout.
- Bottom totals always show Total, GST (when applicable), Diesel, Munshi Charges and final Total.
- Exact A4 landscape print/PDF sizing.
- Removed the generated round stamp and replaced it with the supplied Meera Logistics / J.K. Jadeja / Partner stamp-signature image.
- Fixed table sizing, spacing and overlap.


V38 REAL PDF DOWNLOAD & WHATSAPP SHARE
- Invoice buttons now show only Download (no Print wording).
- Download creates a real A4 landscape PDF named with Invoice Number and Party Name.
- WhatsApp generates the same PDF and uses the device Web Share sheet to attach the PDF directly.
- On desktop browsers that cannot share files, the PDF is downloaded and WhatsApp opens as a safe fallback.
- Partner stamp/signature area is moved upward.
- Login, D1 migrations and Worker backend are unchanged.

V39 STABLE INVOICE VIEW / PRINT / DOWNLOAD
- Separate Print and Download buttons are available in Invoice View and invoice action lists.
- Print uses the exact browser invoice layout and A4 landscape print CSS.
- Download uses a self-contained vector PDF generator; html2canvas/jsPDF CDN rendering was removed.
- LR Number is removed from the top summary and shown line-wise beside each Truck entry.
- Downloaded PDF contains all summary values, totals and line details without right-side clipping.
- Partner stamp/signature is positioned higher and clear of the total table.
- WhatsApp uses the same properly generated invoice PDF on supported mobile share sheets.
- Login, D1 migration, authentication and Worker backend were not modified.


V40 PARTY LEDGER — SAMPLE FORMAT
- Every Party Khata card now shows separate Ledger View and Download buttons below the party summary.
- Ledger View follows the supplied Party Ledger sample: party name/address/GST, Meera Logistics Ledger Account heading, date range, voucher table and Closing Balance.
- Invoice entries appear as Purchase credits; Party receipts appear as Receipt debits, with running Cr/Dr balance.
- Download creates a direct A4 portrait PDF named “PARTY NAME PARTY LEDGER.pdf”.
- Long ledgers automatically continue across multiple PDF pages with page numbering.
- Login, authentication, D1 migration, Worker backend, invoice logic and existing data were not modified.

V41 SUPPLIER LEDGER — SAMPLE FORMAT
- Every Supplier Khata row now becomes a supplier card with separate Ledger View and Download buttons below it.
- Supplier Ledger matches the supplied sample: Meera Logistics heading, supplier/PML identity, as-on date, Total Due summary and trip-wise table.
- Columns: S.No., LR Number, Trip Date, Truck No, Route, Material, Rate, Truck Hire Cost, Advance, Charges, Deduction, Payments and Total Due.
- LR and material are resolved from the linked Trip/Invoice data when available.
- Commission is shown as Deduction; linked supplier advances/payments and supplier/truck charges are included.
- General supplier payments are allocated FIFO so row-wise dues remain auditable and the summary matches the supplier balance.
- PM/non-GST supplier bills are included in the same ledger where applicable.
- Download creates an A4 portrait PDF named with PML number and Supplier name; long ledgers continue across pages.
- Login, authentication, D1 migration, Worker backend, Party Ledger and Invoice modules were not modified.


V42 CLEAN DASHBOARD MENU
- Sidebar now contains only the approved sections.
- Dashboard: Dashboard, Trip History (Transport Khata), Invoice History.
- Account: Party Khata, Supplier Khata.
- Office: Truck & Document, Master, Forms, Reports & Audit.
- Party Payments, Supplier Payments, Truck/Supplier Entries and Office Expenses are hidden from the sidebar only; existing records and internal workflows are preserved.
- Login, D1, Worker, Invoice, Party Ledger and Supplier Ledger logic are unchanged.

V43 SMART OPERATIONS SUITE
- Professional monthly Calendar combines Bookings, Trips, Invoices and Truck Document expiry dates.
- Recycle Bin intercepts normal delete buttons and supports Restore or Permanent Delete.
- Ctrl/Cmd + K Command Palette searches commands, invoices, trips, parties and trucks.
- System Health Dashboard checks D1 connectivity, duplicates, orphan records, missing Truck Master, expired documents, approvals and backups.
- Booking Workflow supports Draft -> Pending Approval -> Approved -> Dispatched -> Converted Trip -> Completed.
- Approval System records requester, approver and decision status.
- Monthly Excel snapshots are generated automatically on the first day of each month and may also be generated manually.
- Cloudflare scheduled backup runs daily at 20:00 UTC / 01:30 India time and keeps the latest 30 D1 snapshots.
- Excel Center exports/imports multi-sheet Excel-compatible XML .xls, CSV and JSON data.
- Offline/PWA service worker caches the app and queues API writes for synchronization when internet returns.
- Truck Document Gallery supports multiple compressed images, filters, preview, expiry and Recycle Bin deletion.
- Existing login code and schema_version 34 are unchanged; advanced tables initialize only when Smart Tools are opened.


V44 AUDIT SOLVE + SUPPLIER TRUCKS + SETTINGS
- Reports & Audit alerts now include Solve buttons.
- Missing Truck Master opens Add Truck with the number prefilled.
- Supplier Khata lists every vehicle linked to each truck owner.
- Supplier Ledger View/PDF shows Truck Number together with Supplier Name.
- Settings button is available in Sidebar, Dashboard and Topbar.
- Settings store company profile, invoice defaults, interface density and backup preferences online.
- Invoice View/PDF and TDS defaults use saved company settings.
- Service Worker navigation is network-first to avoid stale old screens.
- Open /cache-reset-v44.html once after deployment to clear the previous PWA cache.
- Login and D1 schema_version 34 are unchanged.


V45 TRIP AMOUNT & SUPPLIER EDIT
- Universal Trip revenue now uses only the linked Trip/Truck invoice line amount, never the full multi-truck invoice total.
- Profit = this Trip line freight - this Trip supplier payable - this Trip expenses. GST is not treated as profit.
- Party tab shows TRIP BILL AMOUNT and the line-wise LR Number.
- Supplier Name is saved separately on every Trip and is editable from both Universal Trip form and Supplier tab.
- Editing a Trip supplier updates linked Truck/Supplier Entry and Supplier Payments for the same trip_id.
- A new PML supplier account is created automatically when a new per-trip supplier name is used.
- Login/authentication and schema_version 34 are unchanged; supplier_name is added lazily only when Trip operations run.


V47 PARTY LEDGER NUMBER FIX

- Fixed D1 UNIQUE constraint failed: party_accounts.ledger_no.
- Every new Party receives the next collision-safe MLP series automatically.
- Existing blank/NULL Party ledger numbers are repaired after successful login during bootstrap.
- Quick Add Party and master auto-creation also receive MLP numbers.
- Duplicate Party names and manually duplicated ledger numbers return a clear message instead of a raw D1 error.
- Party form shows Ledger Number as automatic/read-only.
- Login, authentication and D1 schema_version 34 were not changed.
- V46 Vercel deployment fix remains included.


V48 NON-GST PARTY GST DISPLAY FIX

- Non-GST Invoice keeps Party GST Number visible just like Party Address.
- Non-GST Universal Trip also shows Party GST Number.
- SGST and CGST remain 0%/hidden for Non-GST; this change only displays/stores the Party GSTIN.
- New Non-GST invoices save Party GSTIN in D1 instead of clearing it.
- Old Non-GST invoices with blank stored GSTIN fall back to the Party Master GST Number when viewed/downloaded.
- GST Invoice behavior is unchanged.
- Login and D1 schema_version 34 are unchanged.


V49 SaaS + Subscription Foundation

Added:
- Company account model.
- Existing Meera Logistics mapped to CMP-MEERA.
- Free Trial, Basic, Pro and Business plan catalog.
- Existing Meera account is GRANDFATHERED Business so current work is not locked.
- Subscription status, feature entitlement and monthly usage context.
- Roles: OWNER, ADMIN, ACCOUNTANT, OPERATOR, VIEWER.
- Team & Access screen for staff login/role/status/password management.
- Company & Plan screen for GST/PAN/contact/address and numbering prefixes.
- Expired subscriptions become read-only.
- Google Play product ID, purchase token and order ID fields are ready.
- No fake subscription purchase is activated.
- V48 Non-GST Party GST fix retained.
- V47 Party MLP fix retained.
- V46 Vercel fix retained.

Important:
V49 is the SaaS FOUNDATION. Public signup for outside transport companies is intentionally not enabled yet. Before onboarding another company, the operational tables must be tenantized with company_id and company-scoped unique numbers/queries. That next migration is required to guarantee that one transporter's trips/invoices/ledgers can never mix with another.

Database:
- schema_version upgrades from 34 to 49 automatically on first Worker request.
- Existing business records are not deleted.


V50 MULTI-COMPANY + EXACT INVOICE PDF VIEW

DONE
1. Full multi-company tenant isolation:
   - company_id on Parties, Party Payments, Trucks, Routes, Materials, Trips, Invoices,
     Invoice Items, PM Bills, PM Bill Items, Supplier Entries, Supplier Payments,
     Supplier Accounts, Expenses, Truck Documents, Audit Logs, Bookings, Approvals,
     Recycle Bin, Backups, Monthly Exports and Settings.
   - Bootstrap, Party Ledger, Supplier Ledger, Advanced Data, Health, Backup,
     Monthly Export and Excel Export are company-scoped.
   - Record-ID tenant guard blocks cross-company direct access.
   - New records are stamped with the logged-in user's company_id.
   - Existing V49 Meera Logistics data is migrated to CMP-MEERA.

2. Company-scoped numbering / uniqueness:
   - Same Party name, Truck number, Material, Invoice number, Supplier/PML,
     Booking number and month key can exist in different companies.
   - Trip number uniqueness is company-wise.
   - Existing data is not deleted.

3. New company signup:
   - Create Transport Company from login screen.
   - 14-day Trial subscription.
   - New OWNER login.
   - New company starts with an empty isolated workspace.

4. Invoice View fixed:
   - View Invoice no longer uses a separate mixed HTML layout.
   - It renders the exact same generated vector PDF blob used by Download.
   - Therefore View and Download are the same invoice format.
   - Print also opens the same PDF preview.

5. Previous fixes retained:
   - V49 SaaS/roles/subscription foundation.
   - V48 Non-GST Party GST display.
   - V47 Party automatic MLP ledger allocation.
   - V46 Vercel build fix.

DATABASE
- schema_version 49 -> 50.
- Worker automatically performs one-time tenant migration.
- Cloudflare Worker MUST be redeployed before using V50 frontend.


V51 D1 COMPANY_ID RECOVERY

FIXED ERROR
D1_ERROR: no such column: company_id

Root cause:
V50 introduced multi-company company_id columns. If the Worker/D1 upgrade was interrupted or a partially
migrated database was used, a company-scoped query could run while users/trips/invoices/advanced tables
had not all received company_id yet.

V51 recovery:
- Forces schema_version 50 -> 51 so the migration runs again.
- Always checks users.company_id on the healthy fast path.
- Adds an explicit ensureUserTenantColumns() recovery.
- Adds healTenantColumns() for every operational/advanced tenant table.
- Login runs database recovery BEFORE selecting company_id.
- saasContext heals tenant columns BEFORE counting users/trips/invoices.
- Authenticated requests and company registration also self-heal.
- Existing Meera Logistics records are retained.
- Existing V50 multi-company features are retained.
- Exact PDF Invoice View from V50 is retained.

DEPLOY ORDER
1. Upload full V51 project to GitHub.
2. Redeploy Cloudflare Worker FIRST.
3. Open/login once so D1 auto-recovers to schema_version 51.
4. Then redeploy Vercel.
5. Open /cache-reset-v51.html once.


V52 FAST D1 MIGRATION / TIMEOUT FIX

FIXED
- "Server response is taking too long. Please retry."
- V51 was still performing schema healing and potentially heavy tenant rebuild work inside normal login/API requests.
- V52 removes repeated ALTER TABLE work from every request.
- Missing company_id columns are detected with ONE sqlite_master query.
- Only genuinely missing columns are added, using D1 batch.
- Schema version becomes 52 immediately after the fast compatibility layer is ready.

NON-BLOCKING MULTI-COMPANY UPGRADE
- Company-scoped UNIQUE table rebuilds are now staged.
- Only up to 2 small table stages run after a response via Worker waitUntil.
- Each table rebuild uses a transactional D1 batch.
- Login and Meera Logistics daily work do not wait for all rebuild stages.
- New outside-company registration remains temporarily blocked until tenant_unique_v52 is complete.
- Routine requests automatically advance the migration; no manual SQL is required.
- /migration-status shows stage, total and ready status after login.

RETAINED
- V50 multi-company company_id data isolation.
- 14-day trial/company registration after migration is ready.
- V50 exact Invoice View = same generated PDF as Download.
- V49 subscription/team foundation.
- V48 Non-GST Party GST.
- V47 Party MLP.
- V46 Vercel fix.

DEPLOY ORDER
1. Upload full V52 ZIP.
2. Redeploy Cloudflare Worker FIRST.
3. Login. The fast compatibility migration runs without the old blocking rebuild.
4. Use the app normally for a few requests; staged tenant upgrade completes automatically.
5. Redeploy Vercel.
6. Open /cache-reset-v52.html once.


V53 STABLE FAST LOGIN + ROOT CACHE RESET

FIXED
- V52 could still time out because ensureSaasFoundation called five ALTER TABLE statements on every fresh Worker isolate.
- V53 inspects users schema once and only ALTERs genuinely missing columns.
- Persistent saas_ready_v53 marker skips repeated SaaS CREATE/seed work.
- Healthy schema_version 53 requests use one version lookup then continue.
- Login no longer waits for SaaS usage calculations.
- Heavy company-unique migration stays in waitUntil, one table per request.
- Login/bootstrap first-load timeout is 45s; normal API remains 20s.

CACHE RESET
Recommended URL: /?reset=v53
It uses the homepage route, so no separate reset page is required.
Fallback route /cache-reset-v53 is also included.

RETAINED
- Multi-company isolation architecture.
- Company signup/14-day trial after tenant migration readiness.
- Exact Invoice View = same generated PDF as Download.
- Subscription/team roles.
- Non-GST Party GST.
- Party MLP fix.
- Vercel static deployment fix.


V54 SUPPLIER / TRUCK PAY + DROPDOWN UX

DONE
- Supplier Khata: every supplier row has Pay Supplier button.
- Supplier Khata: every linked truck has its own Truck-wise Pay button and truck pending amount.
- Trip History: Supplier name appears directly below Truck Number.
- Add/Edit Truck: Truck Number is dropdown; Owner Name is Supplier dropdown.
- New Truck Add and New Supplier Add options are inside dropdowns.
- Invoice truck rows keep dropdown and now New Truck flow uses Supplier dropdown for Owner Name.
- Universal Trip Supplier field is a real dropdown with New Supplier Add.
- Truck Entry and Supplier Payment Owner/Supplier fields are dropdowns.
- Supplier Payment truck selection auto-fills the linked supplier.
- Advanced Booking and Truck Document Gallery also expose New Truck Add in truck dropdown.
- Edit Supplier from Universal Trip now opens a full Supplier & Truck tab with Truck, Supplier, Mobile, Bank, Supplier Rate, Commission, Payable and linked vehicles.
- Saving full Supplier tab updates Trip, Truck Master and the linked Supplier/Truck payable entry.
- Editing a Trip continues to allow Supplier change directly in the full Universal Trip form.
- Explicit Supplier master POST/PUT API added; newly added supplier appears in Supplier Khata even before any payment/entry.
- Trip supplier changes synchronize both owner_name and truck_no into linked supplier entries/payments.

RETAINED
- V53 fast/stable login and non-blocking D1 migration.
- V50 multi-company isolation.
- Invoice View = exact same generated PDF as Download.
- V48 Non-GST Party GST.
- V47 Party MLP fix.

DATABASE
- No new D1 schema migration in V54. schema_version remains 53.

CACHE RESET
- Use /?reset=v54 after Vercel deployment.
