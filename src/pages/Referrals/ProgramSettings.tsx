import React, { useEffect, useState } from 'react';
import Layout from '../../components/Layout';
import { useToast } from '../../components/Toast';
import { getReferralProgram, saveReferralProgram, type ReferralProgram } from '../../lib/api';

// Money is held in paise everywhere behind this screen — the unit the payment
// provider uses — but nobody thinks in paise, so the form works in rupees and
// converts at the edges.
const toRupees = (paise: number) => (paise ? String(Math.round(paise / 100)) : '');
const toPaise = (rupees: string) => Math.round(Number(rupees || 0) * 100);
const digits = (v: string, max: number) => v.replace(/\D/g, '').slice(0, max);

/** What a referral is worth, on both sides of it. */
const ProgramSettings: React.FC = () => {
  const { push } = useToast();
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [isActive, setIsActive] = useState(false);
  const [courseReward, setCourseReward] = useState('');
  const [examReward, setExamReward] = useState('');
  const [discountPercent, setDiscountPercent] = useState('');
  const [discountCap, setDiscountCap] = useState('');
  const [minOrder, setMinOrder] = useState('');
  const [monthlyCap, setMonthlyCap] = useState('');
  const [attributionDays, setAttributionDays] = useState('');
  const [termsUrl, setTermsUrl] = useState('');

  const load = async () => {
    setLoading(true);
    setFailed(false);
    try {
      const p = await getReferralProgram();
      setIsActive(p.is_active);
      setCourseReward(toRupees(p.course_reward_paise));
      setExamReward(toRupees(p.exam_reward_paise));
      setDiscountPercent(p.friend_discount_percent ? String(p.friend_discount_percent) : '');
      setDiscountCap(toRupees(p.friend_discount_cap_paise));
      setMinOrder(toRupees(p.min_order_paise));
      setMonthlyCap(toRupees(p.monthly_cap_paise));
      setAttributionDays(String(p.attribution_days || 30));
      setTermsUrl(p.terms_url ?? '');
    } catch (e: any) {
      setFailed(true);
      push('error', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async () => {
    setError('');
    const percent = Number(discountPercent || 0);
    const days = Number(attributionDays || 0);
    // The same rules the backend enforces, said here so the admin is not told
    // off by a 400 for something the form could have caught.
    if (percent < 0 || percent > 100) return setError('The friend’s discount has to be between 0 and 100%.');
    if (days < 1 || days > 365) return setError('Attribution has to be between 1 and 365 days.');

    const body: ReferralProgram = {
      is_active: isActive,
      course_reward_paise: toPaise(courseReward),
      exam_reward_paise: toPaise(examReward),
      friend_discount_percent: percent,
      friend_discount_cap_paise: toPaise(discountCap),
      min_order_paise: toPaise(minOrder),
      monthly_cap_paise: toPaise(monthlyCap),
      attribution_days: days,
      terms_url: termsUrl.trim(),
    };

    setBusy(true);
    try {
      await saveReferralProgram(body);
      push('success', 'Referral programme saved');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };

  if (loading) {
    return <Layout title="Referral programme"><p className="muted">Loading…</p></Layout>;
  }

  if (failed) {
    return (
      <Layout title="Referral programme">
        <div className="card card-pad">
          <h3 style={{ marginTop: 0 }}>Couldn&apos;t load the programme</h3>
          <p className="muted">Check your connection and try again.</p>
          <button onClick={() => void load()}>Try again</button>
        </div>
      </Layout>
    );
  }

  return (
    <Layout
      title="Referral programme"
      actions={
        <button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save programme'}</button>
      }
    >
      <p className="muted mb">
        These settings decide what a referral is worth on both sides. Changing them affects
        purchases from now on — rewards already earned keep the terms they were earned under.
      </p>

      <div className="card card-pad mb" style={{ maxWidth: 720 }}>
        <div className="field">
          <label>
            <input type="checkbox" checked={isActive} onChange={(e) => setIsActive(e.target.checked)} />
            {' '}Programme is live
          </label>
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Turning it off hides the offer and stops new referrals being credited. Rewards already
            earned are still owed and still payable.
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>What the referrer earns</h3>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Course referral (₹)</label>
            <input inputMode="numeric" value={courseReward}
                   onChange={(e) => setCourseReward(digits(e.target.value, 6))} placeholder="1000" />
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              Paid once for each friend who buys a course.
            </p>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Certification referral (₹)</label>
            <input inputMode="numeric" value={examReward}
                   onChange={(e) => setExamReward(digits(e.target.value, 6))} placeholder="300" />
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              Paid once for each friend who buys a certification exam.
            </p>
          </div>
        </div>

        <div className="field">
          <label>Monthly cap per referrer (₹)</label>
          <input inputMode="numeric" value={monthlyCap}
                 onChange={(e) => setMonthlyCap(digits(e.target.value, 7))} placeholder="10000" />
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            The most one referrer can earn in a calendar month; anything past it stops being
            credited until the month turns. Leave it at 0 for no ceiling.
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>What the friend saves</h3>
        <div className="row">
          <div className="field" style={{ flex: 1 }}>
            <label>Discount (%)</label>
            <input inputMode="numeric" value={discountPercent}
                   onChange={(e) => setDiscountPercent(digits(e.target.value, 3))} placeholder="10" />
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              Taken off the friend&apos;s first purchase when they use the code.
            </p>
          </div>
          <div className="field" style={{ flex: 1 }}>
            <label>Discount cap (₹)</label>
            <input inputMode="numeric" value={discountCap}
                   onChange={(e) => setDiscountCap(digits(e.target.value, 6))} placeholder="2000" />
            <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
              The most that percentage may ever take off, however expensive the course. 0 for no cap.
            </p>
          </div>
        </div>

        <div className="field">
          <label>Minimum order (₹)</label>
          <input inputMode="numeric" value={minOrder}
                 onChange={(e) => setMinOrder(digits(e.target.value, 6))} placeholder="999" />
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Purchases below this earn nothing and get no discount — it keeps the reward from
            costing more than the sale.
          </p>
        </div>

        <hr style={{ border: 'none', borderTop: '1px solid var(--border)', margin: '16px 0' }} />

        <h3 style={{ margin: '0 0 12px', fontSize: 15 }}>Rules</h3>
        <div className="field">
          <label>Attribution window (days) *</label>
          <input inputMode="numeric" value={attributionDays} style={{ maxWidth: 140 }}
                 onChange={(e) => setAttributionDays(digits(e.target.value, 3))} placeholder="30" />
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            How long after clicking the link a purchase still counts as that referral. A friend who
            buys on day {attributionDays || '30'} earns the reward; a day later, nobody does.
          </p>
        </div>

        <div className="field">
          <label>Terms link</label>
          <input value={termsUrl} onChange={(e) => setTermsUrl(e.target.value)}
                 placeholder="https://…/referral-terms" />
          <p className="muted" style={{ fontSize: 12, margin: '4px 0 0' }}>
            Shown beside the offer. It is what a referrer is held to when a reward is rejected.
          </p>
        </div>

        {error && <p style={{ color: 'var(--danger, #b91c1c)', fontSize: 13 }}>{error}</p>}

        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button disabled={busy} onClick={save}>{busy ? 'Saving…' : 'Save programme'}</button>
        </div>
      </div>
    </Layout>
  );
};

export default ProgramSettings;
