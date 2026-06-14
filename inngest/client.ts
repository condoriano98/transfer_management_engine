import { Inngest } from "inngest";

export const inngest = new Inngest({
  id: "transfer-management-engine",
  eventKey: process.env.INNGEST_EVENT_KEY,
});

export type Events = {
  "transfer.requested": {
    data: { request_id: string; org_id: string; idempotency_key: string };
  };
  "transfer.approved": {
    data: { request_id: string; org_id: string; idempotency_key: string };
  };
};
