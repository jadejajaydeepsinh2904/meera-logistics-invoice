# Meera Logistics ERP v3 Source

આ build હવે single HTML demo નથી. તે modular editable source project છે.

## Structure
- `src/core/dataStore.js` — data loading
- `src/core/ledgerEngine.js` — invoice, party, supplier અને reconciliation logic
- `src/app.js` — UI rendering and module navigation
- `data/*.json` — exported Meera Logistics data
- `data/party-payments.json` — future party payment import file

## Current modules
- Dashboard
- Trips
- Invoices
- Party Ledger
- Truck Payment = Supplier Payment
- Supplier / Malik Ledger
- Truck Master
- Routes
- Profit Report
- Data Audit

## Calculation rules
- Supplier payable = weight × rate − commission
- Supplier pending = payable − paid
- Party outstanding = invoice total − party receipts
- Estimated profit = invoice subtotal − supplier payable − expenses

## Run
Direct double-click may block JSON fetch in some browsers.

Use:
```bash
npm run dev
```
or VS Code Live Server.

## Next required data
Party payment API export. Put it into:
`data/party-payments.json`

Expected format:
```json
{
  "payments": [
    {
      "id": "1",
      "partyName": "PARTY NAME",
      "date": "2026-08-04",
      "amount": 10000,
      "invoiceId": "optional",
      "notes": ""
    }
  ]
}
```

## Important
This project does not overwrite or delete the old live ChatGPT website.


## Party payments imported
4 party-payment records have now been imported.

Important audit:
- YADUNANDAN LOGISTICS payment is ₹66,263.
- The current invoice export contains only ₹25,809.55 billing for that party.
- Therefore the system flags this as either missing invoices in the export or an advance/overpayment. It does not silently mark the ledger as correct.


## Party accounts imported
6 party ledger numbers (MLP - 001 to MLP - 006) are now linked with Party Ledger.
