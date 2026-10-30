/**
 * Product name and domain in one place, so a rename is a one-line change.
 *
 * Before launch: register the domain and file the trademark with the
 * Intellectual Property Agency (ima.uz).
 */
export const BRAND = {
  name: 'Voli',
  /** Two-part wordmark: the first part, the V, is drawn in the accent colour. */
  wordmark: ['V', 'oli'] as const,
  tagline: 'Все зарядки. Одно приложение.',
  domain: 'voli.uz',
  /** General address: legal pages, anything without its own mailbox. */
  email: 'info@voli.uz',
  /** One mailbox per kind of conversation. */
  emails: {
    info: 'info@voli.uz',
    hello: 'hello@voli.uz',
    partners: 'partners@voli.uz',
    business: 'business@voli.uz',
    hr: 'hr@voli.uz',
    support: 'support@voli.uz',
  },
};
