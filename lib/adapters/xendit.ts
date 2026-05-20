/**
 * Thin Xendit disbursement adapter. Real production code would use the
 * official Xendit SDK; this module isolates the surface so tests can mock it.
 */
export type XenditDisbursementInput = {
  external_id: string;
  amount: number;          // minor units
  currency: string;
  description: string;
  bank_code?: string;
  account_holder_name?: string;
  account_number?: string;
};

export type XenditDisbursementResult = {
  id: string;
  status: "PENDING" | "COMPLETED" | "FAILED";
};

export interface XenditClient {
  createDisbursement(input: XenditDisbursementInput): Promise<XenditDisbursementResult>;
}

export class HttpXenditClient implements XenditClient {
  constructor(private apiKey = process.env.XENDIT_API_KEY!) {}

  async createDisbursement(input: XenditDisbursementInput): Promise<XenditDisbursementResult> {
    const res = await fetch("https://api.xendit.co/disbursements", {
      method: "POST",
      headers: {
        Authorization: "Basic " + Buffer.from(this.apiKey + ":").toString("base64"),
        "Content-Type": "application/json",
      },
      body: JSON.stringify(input),
    });
    if (!res.ok) {
      throw new Error(`xendit ${res.status}: ${await res.text()}`);
    }
    const body = (await res.json()) as { id: string; status: XenditDisbursementResult["status"] };
    return { id: body.id, status: body.status };
  }
}

export function xenditFromEnv(): XenditClient {
  return new HttpXenditClient();
}
