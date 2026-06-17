import { describe, it, expect } from "vitest";
import {
  nextStatus,
  isTerminal,
  InvalidTransitionError,
  type TransferStatus,
  type TransferEvent,
} from "@/lib/transfers/state";

describe("transfer lifecycle integration", () => {
  describe("complete happy path", () => {
    it("full lifecycle: request → approve → execute → settle", () => {
      const transitions: Array<{ from: TransferStatus; event: TransferEvent; to: TransferStatus }> = [
        { from: "pending", event: { type: "approve" }, to: "approved" },
        { from: "approved", event: { type: "execute" }, to: "executing" },
        { from: "executing", event: { type: "settle" }, to: "settled" },
      ];

      let status: TransferStatus = "pending";
      for (const t of transitions) {
        expect(status).toBe(t.from);
        status = nextStatus(status, t.event);
        expect(status).toBe(t.to);
      }

      expect(isTerminal(status)).toBe(true);
      expect(status).toBe("settled");
    });
  });

  describe("rejection flows", () => {
    it("pending → rejected (immediate terminal)", () => {
      const status = nextStatus("pending", { type: "reject" });
      expect(status).toBe("rejected");
      expect(isTerminal(status)).toBe(true);
    });

    it("cannot transition from rejected", () => {
      expect(() => nextStatus("rejected", { type: "approve" })).toThrow(InvalidTransitionError);
      expect(() => nextStatus("rejected", { type: "execute" })).toThrow(InvalidTransitionError);
      expect(() => nextStatus("rejected", { type: "settle" })).toThrow(InvalidTransitionError);
    });
  });

  describe("cancellation flows", () => {
    it("can cancel from pending", () => {
      const status = nextStatus("pending", { type: "cancel" });
      expect(status).toBe("cancelled");
      expect(isTerminal(status)).toBe(true);
    });

    it("can cancel from approved (before execution)", () => {
      const status = nextStatus("approved", { type: "cancel" });
      expect(status).toBe("cancelled");
      expect(isTerminal(status)).toBe(true);
    });

    it("cannot cancel from executing", () => {
      expect(() => nextStatus("executing", { type: "cancel" })).toThrow(InvalidTransitionError);
    });

    it("cannot cancel from settled", () => {
      expect(() => nextStatus("settled", { type: "cancel" })).toThrow(InvalidTransitionError);
    });
  });

  describe("failure and retry", () => {
    it("executing → failed → executing (retry)", () => {
      let status: TransferStatus = "executing";
      status = nextStatus(status, { type: "fail", reason: "network error" });
      expect(status).toBe("failed");
      expect(isTerminal(status)).toBe(false);

      status = nextStatus(status, { type: "execute" });
      expect(status).toBe("executing");
    });

    it("failed → executing → settled (retry then succeed)", () => {
      let status: TransferStatus = "executing";
      status = nextStatus(status, { type: "fail" });
      expect(status).toBe("failed");

      status = nextStatus(status, { type: "execute" });
      expect(status).toBe("executing");

      status = nextStatus(status, { type: "settle" });
      expect(status).toBe("settled");
      expect(isTerminal(status)).toBe(true);
    });
  });

  describe("invalid transitions", () => {
    it("cannot approve from approved", () => {
      expect(() => nextStatus("approved", { type: "approve" })).toThrow(InvalidTransitionError);
    });

    it("cannot execute from pending", () => {
      expect(() => nextStatus("pending", { type: "execute" })).toThrow(InvalidTransitionError);
    });

    it("cannot settle from pending", () => {
      expect(() => nextStatus("pending", { type: "settle" })).toThrow(InvalidTransitionError);
    });

    it("cannot settle from approved", () => {
      expect(() => nextStatus("approved", { type: "settle" })).toThrow(InvalidTransitionError);
    });

    it("cannot fail from pending", () => {
      expect(() => nextStatus("pending", { type: "fail" })).toThrow(InvalidTransitionError);
    });

    it("cannot transition from settled", () => {
      expect(() => nextStatus("settled", { type: "approve" })).toThrow(InvalidTransitionError);
      expect(() => nextStatus("settled", { type: "execute" })).toThrow(InvalidTransitionError);
      expect(() => nextStatus("settled", { type: "settle" })).toThrow(InvalidTransitionError);
      expect(() => nextStatus("settled", { type: "fail" })).toThrow(InvalidTransitionError);
    });
  });

  describe("terminal states", () => {
    it("settled is terminal", () => {
      expect(isTerminal("settled")).toBe(true);
    });

    it("rejected is terminal", () => {
      expect(isTerminal("rejected")).toBe(true);
    });

    it("cancelled is terminal", () => {
      expect(isTerminal("cancelled")).toBe(true);
    });

    it("pending is not terminal", () => {
      expect(isTerminal("pending")).toBe(false);
    });

    it("approved is not terminal", () => {
      expect(isTerminal("approved")).toBe(false);
    });

    it("executing is not terminal", () => {
      expect(isTerminal("executing")).toBe(false);
    });

    it("failed is not terminal (allows retry)", () => {
      expect(isTerminal("failed")).toBe(false);
    });
  });
});
