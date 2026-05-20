export type TransferStatus =
  | "pending"
  | "approved"
  | "executing"
  | "settled"
  | "rejected"
  | "failed"
  | "cancelled";

export type TransferEvent =
  | { type: "approve" }
  | { type: "reject" }
  | { type: "cancel" }
  | { type: "execute" }
  | { type: "settle" }
  | { type: "fail"; reason?: string };

const TRANSITIONS: Record<TransferStatus, Partial<Record<TransferEvent["type"], TransferStatus>>> = {
  pending:   { approve: "approved",  reject: "rejected", cancel: "cancelled" },
  approved:  { execute: "executing", cancel: "cancelled" },
  executing: { settle: "settled",    fail: "failed" },
  settled:   {},
  rejected:  {},
  failed:    { execute: "executing" }, // allow retry
  cancelled: {},
};

export class InvalidTransitionError extends Error {
  constructor(from: TransferStatus, event: TransferEvent["type"]) {
    super(`invalid transition: ${from} --${event}-->`);
    this.name = "InvalidTransitionError";
  }
}

export function nextStatus(
  from: TransferStatus,
  event: TransferEvent,
): TransferStatus {
  const to = TRANSITIONS[from]?.[event.type];
  if (!to) throw new InvalidTransitionError(from, event.type);
  return to;
}

export const TERMINAL: ReadonlySet<TransferStatus> = new Set([
  "settled",
  "rejected",
  "cancelled",
]);

export function isTerminal(s: TransferStatus): boolean {
  return TERMINAL.has(s);
}
