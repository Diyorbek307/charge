import { db } from './db.js';

/**
 * Which company a thing belongs to (server/companies.js has the routes).
 * No imports beyond the database, so any module can use it.
 */

export const DEMO_ORG = 'biz-001';
/** The company a thing belongs to; records from before companies had ids are the demo one's. */
export const orgOf = x => x?.orgId ?? DEMO_ORG;
/** The wallet a corporate charge is paid from. */
export const companyWallet = session => orgOf(session);

export function companies() {
  const list = (db.data.companies ??= []);
  // The demo company existed before the list did.
  if (!list.some(c => c.id === DEMO_ORG)) {
    const demo = db.data.accounts.find(a => a.portal === 'business' && a.orgId === DEMO_ORG);
    if (demo) list.push({ id: DEMO_ORG, name: demo.org ?? 'Автопарк', inn: null, createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'Voli', demo: true });
  }
  return list;
}
export const companyById = id => companies().find(c => c.id === id) ?? null;
export const isCompany = id => !!id && companies().some(c => c.id === id);

