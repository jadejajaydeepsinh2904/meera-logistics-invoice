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
