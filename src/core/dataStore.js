
export const money = n => '₹' + Number(n || 0).toLocaleString('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2
});
export const round2 = n => Math.round((Number(n) + Number.EPSILON) * 100) / 100;

export async function loadDatabase(){
  const names = [
    'truck-payments','invoices','trip-bookings','trip-account-entries',
    'trip-expenses','trucks','routes','party-payments','party-accounts'
  ];
  const files = await Promise.all(names.map(n => fetch(`./data/${n}.json`).then(r => {
    if(!r.ok) throw new Error(`Failed to load ${n}`);
    return r.json();
  })));
  return {
    payments: files[0].payments || [],
    invoices: files[1].invoices || [],
    trips: files[2].trips || [],
    entries: files[3].entries || [],
    expenses: files[4].expenses || [],
    trucks: files[5].trucks || [],
    routes: files[6].routes || [],
    partyPayments: files[7].payments || [],
    partyAccounts: files[8].partyAccounts || []
  };
}
