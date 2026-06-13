/**
 * Mandiri Livin' Merchant adapter surface.
 *
 * The platform talks to Mandiri through this interface only — concrete
 * H2H wiring (auth scheme, endpoint paths, signing) lands in a later phase
 * once the API contract is locked. MockMandiriClient powers tests and
 * pre-integration development.
 */

export type DisburseInput = {
  /** Client-side idempotency key, deterministic per transfer attempt. */
  idempotencyKey: string;
  /** Destination bank code. "BMRI" for internal, else BI-FAST / SKN code. */
  destBank: string;
  destAccount: string;
  destName: string;
  /** Amount in minor units (IDR sen — but Mandiri practice uses IDR whole). */
  amount: number;
  remark: string;
};

export type DisburseStatus = "pending" | "success" | "failed";

export type DisburseResult = {
  /** Mandiri-assigned transaction reference. */
  ref: string;
  status: DisburseStatus;
  failReason?: string;
};

export type StatementLine = {
  statementDate: string; // YYYY-MM-DD
  lineNo: number;
  description: string;
  debit: number;         // 0 if line is a credit
  credit: number;        // 0 if line is a debit
  runningBalance: number;
  referenceCode?: string;
};

export interface MandiriClient {
  disburse(input: DisburseInput): Promise<DisburseResult>;
  getBalance(): Promise<{ balance: number; currency: string }>;
  getStatement(date: Date): Promise<StatementLine[]>;
  /** Synchronous: just validates HMAC / signature on the raw bytes. */
  verifyWebhookSignature(
    headers: Record<string, string>,
    rawBody: string,
  ): boolean;
}

/**
 * Test + early-dev double. Behavior is deterministic: configure expected
 * results before calling, assert on what the platform sent.
 */
export class MockMandiriClient implements MandiriClient {
  private disburseResults = new Map<string, DisburseResult>();
  private disburseCalls: DisburseInput[] = [];
  private balance = 0;
  private statement: StatementLine[] = [];
  private signatureValid = true;

  setDisburseResult(idempotencyKey: string, result: DisburseResult): void {
    this.disburseResults.set(idempotencyKey, result);
  }
  setBalance(balance: number): void {
    this.balance = balance;
  }
  setStatement(lines: StatementLine[]): void {
    this.statement = lines;
  }
  setSignatureValid(valid: boolean): void {
    this.signatureValid = valid;
  }
  getDisburseCalls(): readonly DisburseInput[] {
    return this.disburseCalls;
  }

  async disburse(input: DisburseInput): Promise<DisburseResult> {
    this.disburseCalls.push(input);
    return (
      this.disburseResults.get(input.idempotencyKey) ?? {
        ref: `MOCK-${input.idempotencyKey}`,
        status: "pending",
      }
    );
  }

  async getBalance(): Promise<{ balance: number; currency: string }> {
    return { balance: this.balance, currency: "IDR" };
  }

  async getStatement(): Promise<StatementLine[]> {
    return this.statement;
  }

  verifyWebhookSignature(
    _headers: Record<string, string>,
    _rawBody: string,
  ): boolean {
    return this.signatureValid;
  }
}

/**
 * Stub for the real client. Filled in once Livin' Merchant API contract,
 * auth scheme, and webhook signing are confirmed.
 */
export class HttpMandiriClient implements MandiriClient {
  async disburse(): Promise<DisburseResult> {
    throw new Error("HttpMandiriClient.disburse: not implemented yet");
  }
  async getBalance(): Promise<{ balance: number; currency: string }> {
    throw new Error("HttpMandiriClient.getBalance: not implemented yet");
  }
  async getStatement(): Promise<StatementLine[]> {
    throw new Error("HttpMandiriClient.getStatement: not implemented yet");
  }
  verifyWebhookSignature(): boolean {
    throw new Error(
      "HttpMandiriClient.verifyWebhookSignature: not implemented yet",
    );
  }
}
