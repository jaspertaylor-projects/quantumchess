export const PREMIUM_AMOUNT = 1000;
export const PREMIUM_CURRENCY = 'usd';

export function premiumCheckoutParameters(price: string, customer: string, userId: string, origin: string, expiresAt: number) {
  return {
    mode: 'payment' as const,
    payment_method_types: ['card' as const],
    customer,
    line_items: [{ price, quantity: 1 }],
    client_reference_id: userId,
    metadata: { qc_user_id: userId, qc_kind: 'lifetime' },
    payment_intent_data: { metadata: { qc_user_id: userId, qc_kind: 'lifetime' } },
    success_url: `${origin}/?premium=success`,
    cancel_url: `${origin}/?premium=cancelled`,
    expires_at: expiresAt,
  };
}

type PaymentSession = {
  mode: string | null;
  payment_status: string;
  client_reference_id: string | null;
  customer: string | { id: string } | null;
  metadata: Record<string, string> | null;
  amount_total: number | null;
  currency: string | null;
};

// Only confirmed payments can unlock Premium. Old completed tip/subscription
// sessions are honored during the transition, but no new ones are created.
export function premiumGrantForSession(session: PaymentSession) {
  if (session.payment_status !== 'paid') return null;
  const kind = session.metadata?.qc_kind;
  const current = session.mode === 'payment' && kind === 'lifetime';
  const legacy = (session.mode === 'payment' && kind === 'tip') || session.mode === 'subscription';
  if (!current && !legacy) return null;
  if (current && (session.amount_total !== PREMIUM_AMOUNT || session.currency !== PREMIUM_CURRENCY)) {
    throw new Error('Unexpected Premium payment amount or currency');
  }
  const userId = session.client_reference_id;
  const customerId = typeof session.customer === 'string' ? session.customer : session.customer?.id;
  if (!userId || !customerId) throw new Error('Payment is missing its account reference');
  if (current && session.metadata?.qc_user_id !== userId) throw new Error('Payment account mismatch');
  return { userId, customerId };
}
