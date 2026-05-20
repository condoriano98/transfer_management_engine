import { describe, it, expect } from "vitest";
import {
  nextStatus,
  isTerminal,
  InvalidTransitionError,
  type TransferStatus,
} from "@/lib/transfers/state";

describe("transfer state machine", () => {
  it("happy path: pending → approved → executing → settled", () => {
    let s: TransferStatus = "pending";
    s = nextStatus(s, { type: "approve" });
    expect(s).toBe("approved");
    s = nextStatus(s, { type: "execute" });
    expect(s).toBe("executing");
    s = nextStatus(s, { type: "settle" });
    expect(s).toBe("settled");
    expect(isTerminal(s)).toBe(true);
  });

  it("rejection ends the request", () => {
    const s = nextStatus("pending", { type: "reject" });
    expect(s).toBe("rejected");
    expect(isTerminal(s)).toBe(true);
    expect(() => nextStatus(s, { type: "approve" })).toThrow(InvalidTransitionError);
  });

  it("cancel only from pending or approved", () => {
    expect(nextStatus("pending",  { type: "cancel" })).toBe("cancelled");
    expect(nextStatus("approved", { type: "cancel" })).toBe("cancelled");
    expect(() => nextStatus("executing", { type: "cancel" })).toThrow();
    expect(() => nextStatus("settled",   { type: "cancel" })).toThrow();
  });

  it("failed transfers can be retried", () => {
    let s: TransferStatus = "executing";
    s = nextStatus(s, { type: "fail" });
    expect(s).toBe("failed");
    s = nextStatus(s, { type: "execute" });
    expect(s).toBe("executing");
  });

  it("cannot approve twice", () => {
    const s = nextStatus("pending", { type: "approve" });
    expect(() => nextStatus(s, { type: "approve" })).toThrow(InvalidTransitionError);
  });
});
