import { describe, expect, it } from 'vitest';
import { premiumCheckoutParameters, premiumGrantForSession } from '../../supabase/functions/_shared/premiumBilling.ts';
const paid = { mode: 'payment', payment_status: 'paid', client_reference_id: 'u1', customer: 'cus_1', metadata: { qc_kind: 'lifetime', qc_user_id: 'u1' }, amount_total: 1000, currency: 'usd' };
describe('permanent Premium fulfillment', () => {
  it('creates a one-time card payment with no subscription or reusable off-session mandate', () => {
    const params = premiumCheckoutParameters('price_10','cus_1','u1','https://quantumchess.ninja',12345);
    expect(params).toMatchObject({ mode:'payment', payment_method_types:['card'], line_items:[{price:'price_10',quantity:1}], expires_at:12345 });
    expect(params.subscription_data).toBeUndefined();
    expect(params.payment_intent_data.setup_future_usage).toBeUndefined();
  });
  it('grants only after payment succeeds, including a delayed successful event', () => {
    expect(premiumGrantForSession({...paid,payment_status:'unpaid'})).toBeNull();
    expect(premiumGrantForSession({...paid,payment_status:'no_payment_required'})).toBeNull();
    expect(premiumGrantForSession(paid)).toEqual({userId:'u1',customerId:'cus_1'});
    expect(premiumGrantForSession({...paid,customer:{id:'cus_1'}})).toEqual({userId:'u1',customerId:'cus_1'});
  });
  it('rejects incorrect prices, currencies and account references', () => {
    for (const patch of [{amount_total:300},{currency:'eur'},{client_reference_id:null},{customer:null},{metadata:{qc_kind:'lifetime',qc_user_id:'someone-else'}}]) {
      expect(()=>premiumGrantForSession({...paid,...patch})).toThrow();
    }
    expect(premiumGrantForSession({...paid,metadata:{qc_kind:'unrelated'}})).toBeNull();
  });
  it('honors already-paid old checkouts without creating a temporary tier', () => {
    expect(premiumGrantForSession({...paid,amount_total:500,metadata:{qc_kind:'tip'}})).toEqual({userId:'u1',customerId:'cus_1'});
    expect(premiumGrantForSession({...paid,mode:'subscription',amount_total:300,metadata:null})).toEqual({userId:'u1',customerId:'cus_1'});
  });
});
