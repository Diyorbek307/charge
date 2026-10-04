import { useState, type ReactNode } from 'react';
import type { FormEvent } from 'react';
import { Car, Building2, Users, Handshake, Send, Check, LoaderCircle } from 'lucide-react';
import { apiClient, ApiError, type LeadKind } from '../lib/api';
import type { Lang } from '../lib/i18n';
import type { LandingCopy } from './content';
import { track } from './analytics';

const KINDS: { id: LeadKind; icon: ReactNode }[] = [
  { id: 'driver', icon: <Car size={16} /> },
  { id: 'operator', icon: <Building2 size={16} /> },
  { id: 'fleet', icon: <Users size={16} /> },
  { id: 'partner', icon: <Handshake size={16} /> },
];

const EMPTY = { name: '', phone: '+998 ', company: '', city: '', size: '', message: '', website: '' };

/** Same rule as the server: 9 digits after 998, spaces and dashes allowed. */
const validPhone = (raw: string) => {
  let d = raw.replace(/\D/g, '');
  if (d.length === 9) d = `998${d}`;
  return /^998\d{9}$/.test(d);
};

/**
 * Launch waitlist for drivers and partner requests for operators, fleets and
 * venues. Leads land in the admin console (Заявки).
 */
export default function Join({ c, lang, privacyHref }: { c: LandingCopy; lang: Lang; privacyHref: string }) {
  const j = c.join;
  const [kind, setKind] = useState<LeadKind>('driver');
  const [form, setForm] = useState(EMPTY);
  const [consent, setConsent] = useState(false);
  const [status, setStatus] = useState<'idle' | 'sending' | 'done'>('idle');
  const [duplicate, setDuplicate] = useState(false);
  const [error, setError] = useState('');
  const business = kind !== 'driver';
  const set = (k: keyof typeof EMPTY) => (e: { target: { value: string } }) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (form.name.trim().length < 2) return setError(j.errors.name);
    if (!validPhone(form.phone)) return setError(j.errors.phone);
    if (business && form.company.trim().length < 2) return setError(j.errors.company);
    if (!consent) return setError(j.errors.consent);
    setError('');
    setStatus('sending');
    try {
      const res = await apiClient.submitLead({
        kind,
        name: form.name,
        phone: form.phone,
        company: business ? form.company : '',
        city: form.city,
        size: business ? form.size : '',
        message: business ? form.message : '',
        consent: true,
        lang,
        website: form.website,
      });
      setDuplicate(!!res.duplicate);
      setStatus('done');
      track('lead', { kind });
    } catch (err) {
      setStatus('idle');
      setError(err instanceof ApiError && err.status === 429 ? j.errors.rate : j.errors.generic);
    }
  };

  const reset = () => {
    setForm(EMPTY);
    setConsent(false);
    setDuplicate(false);
    setStatus('idle');
  };

  return (
    <section className="lp-sec" id="join">
      <div className="lp-wrap lp-join">
        <div className="lp-join-copy rv">
          <p className="lp-kicker"><span />{j.kicker}</p>
          <h2 className="lp-h2">{j.title}</h2>
          <p className="lp-sub">{j.sub}</p>
          <div className="lp-join-kinds" role="tablist" aria-label={j.kicker}>
            {KINDS.map(k => (
              <button
                key={k.id}
                type="button"
                role="tab"
                aria-selected={kind === k.id}
                onClick={() => { setKind(k.id); setError(''); }}
              >
                {k.icon}
                <span>
                  <b>{j.tabs[k.id]}</b>
                  <small>{j.pitch[k.id]}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="lp-card lp-join-form rv" role="tabpanel">
          {status === 'done' ? (
            <div className="lp-join-done" role="status">
              <span><Check size={28} strokeWidth={3} /></span>
              <h3>{j.done}</h3>
              <p>{duplicate ? j.already : kind === 'driver' ? j.doneDriver : j.doneOther}</p>
              <button type="button" className="lp-btn lp-btn-ghost" onClick={reset}>{j.again}</button>
            </div>
          ) : (
            <form onSubmit={submit} noValidate>
              <p className="lp-join-pitch">{j.pitch[kind]}</p>
              <div className="lp-form-row">
                <label className="lp-field">
                  <span>{j.name}</span>
                  <input autoComplete="name" value={form.name} onChange={set('name')} maxLength={80} required />
                </label>
                <label className="lp-field">
                  <span>{j.phone}</span>
                  <input type="tel" inputMode="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} maxLength={20} required />
                </label>
              </div>
              {business && (
                <div className="lp-form-row">
                  <label className="lp-field">
                    <span>{j.company}</span>
                    <input autoComplete="organization" value={form.company} onChange={set('company')} maxLength={120} required />
                  </label>
                  <label className="lp-field">
                    <span>{j.size[kind as Exclude<LeadKind, 'driver'>]} <em>{j.optional}</em></span>
                    <input value={form.size} onChange={set('size')} maxLength={40} />
                  </label>
                </div>
              )}
              <label className="lp-field">
                <span>{j.city} <em>{j.optional}</em></span>
                <input autoComplete="address-level2" value={form.city} onChange={set('city')} maxLength={60} />
              </label>
              {business && (
                <label className="lp-field">
                  <span>{j.message} <em>{j.optional}</em></span>
                  <textarea rows={3} value={form.message} onChange={set('message')} maxLength={1000} />
                </label>
              )}
              {/* Honeypot: hidden from people and screen readers, bots fill it. */}
              <input className="lp-hp" tabIndex={-1} autoComplete="off" aria-hidden="true" value={form.website} onChange={set('website')} />
              <label className="lp-consent">
                <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                <span>
                  {j.consent} <a href={privacyHref} target="_blank" rel="noopener">{j.consentLink}</a>
                </span>
              </label>
              {error && <p className="lp-form-error" role="alert">{error}</p>}
              <button type="submit" className="lp-btn lp-btn-primary lp-btn-lg lp-join-submit" disabled={status === 'sending'}>
                {status === 'sending' ? <LoaderCircle size={18} className="lp-spin" /> : <Send size={18} />}
                {status === 'sending' ? j.sending : kind === 'driver' ? j.submit.driver : j.submit.other}
              </button>
            </form>
          )}
        </div>
      </div>
    </section>
  );
}
