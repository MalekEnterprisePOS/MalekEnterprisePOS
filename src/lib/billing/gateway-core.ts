/**
 * Shared payment-gateway types. Kept in their own file so each gateway (mock, Yoco) can import them without a
 * circular dependency on gateway.ts, which is the one place that picks the gateway from the environment.
 */
export interface PaymentEvent {
  type: "payment.succeeded" | "payment.failed";
  /** Gateway transaction id. Used for idempotency: the same reference is never processed twice. */
  reference: string;
  /** The invoice this payment is for. May be "" when the gateway only echoed a checkout id (see checkoutRef). */
  invoiceId: string;
  /** Gateway checkout id. The webhook route uses it to find the invoice when `invoiceId` is empty. */
  checkoutRef?: string;
  amount: number;
  currency: string;
}

export interface PaymentGateway {
  readonly name: string;
  /**
   * Throws GatewayError if the signature is wrong or the payload can't be understood.
   * Returns null for a genuine, correctly-signed event we simply don't act on (e.g. refunds), so the gateway
   * gets a 200 and stops retrying it.
   */
  verifyAndParse(rawBody: string, headers: Headers): PaymentEvent | null;
}

export class GatewayError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}
