# Meera Logistics ERP — Complete Online Source

આ package Cloudflare Pages + Workers + D1 માટે તૈયાર છે.

## Implemented
- Password login and shared online database
- Mobile + PC responsive UI
- Dashboard
- Trip create/edit/delete with duplicate check
- Invoice create/edit/delete with GST auto calculation
- Party master and ledger
- Party payment create/edit/delete
- Truck payment / supplier payment create/edit/delete
- Supplier ledger
- Truck master create/edit/delete
- Routes create/edit/delete
- Materials add/delete
- Expenses create/edit/delete
- Truck document metadata and expiry date
- Profit report
- Audit warnings and change audit log
- JSON backup export
- Print / Save as PDF
- WhatsApp invoice summary
- Database indexes and validation

## Not automatic
Cloudflare account, D1 database ID, password and domain are private account-specific values. They cannot be prefilled safely inside a downloadable ZIP.

## Setup
1. Create a Cloudflare account.
2. Create D1 database: `meera-logistics-erp`.
3. Paste its ID in `worker/wrangler.toml`.
4. Run:
   `cd worker`
   `npm install`
   `npm run db:migrate`
5. Create admin SQL:
   `node setup-admin.js admin YOUR_PASSWORD`
6. Run the generated SQL in D1 Console.
7. Run `seed.sql` in D1 Console.
8. Deploy Worker:
   `npm run deploy`
9. Deploy the `public` folder to Cloudflare Pages.
10. Configure `/api/*` to the Worker domain using a Pages redirect/proxy or change `public/src/core/api.js` to your Worker URL.

## File uploads
This build stores document name, URL and expiry. Real binary upload requires Cloudflare R2 configuration. R2 credentials and bucket are account-specific, so they are not embedded.

## Security
The starter uses SHA-256 password hashing for portability. Before exposing it widely, replace it with PBKDF2/scrypt/Argon2. For a small private office tool behind a strong password, it is functional, but stronger hashing is recommended.


## Automatic setup version
No D1 Console SQL paste is required in this package.
On the first Worker request, the Worker automatically:
- creates all required tables,
- creates the temporary admin login,
- imports the six party accounts,
- imports the four party payments.

Temporary login:
- Username: `admin`
- Password: `Meera@2026`

Frontend API is already connected to:
`https://meera-logistics-invoice.jadejajaydeepsinhk007.workers.dev`
