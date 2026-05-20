import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { transferExecute } from "@/inngest/functions/transfer-execute";
import { approvalNotify } from "@/inngest/functions/approval-notify";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [transferExecute, approvalNotify],
});
