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
