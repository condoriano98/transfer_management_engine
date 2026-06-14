import { serve } from "inngest/next";
import { inngest } from "@/inngest/client";
import { transferExecute } from "@/inngest/functions/transfer-execute";
import { approvalNotify } from "@/inngest/functions/approval-notify";
import { reconcileDaily } from "@/inngest/functions/reconcile-daily";
import { recoverOrphaned } from "@/inngest/functions/recover-orphaned";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [transferExecute, approvalNotify, reconcileDaily, recoverOrphaned],
});
