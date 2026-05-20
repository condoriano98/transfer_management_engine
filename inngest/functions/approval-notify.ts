import { inngest } from "@/inngest/client";
import { supabaseAdmin } from "@/lib/db/supabase-server";
import { notifyApprovers } from "@/lib/adapters/notifications";
import { requiredApproverRole } from "@/lib/approvals/rules";

export const approvalNotify = inngest.createFunction(
  { id: "approval.notify", retries: 2 },
  { event: "transfer.requested" },
  async ({ event, step }) => {
    const { request_id } = event.data;
    const sb = supabaseAdmin();

    const ctx = await step.run("load-context", async () => {
      const { data: req } = await sb
        .from("transfer_requests")
        .select(
          "id,org_id,amount,currency,to_account_id,from_account_id,requested_by",
        )
        .eq("id", request_id)
        .single();
      if (!req) throw new Error("request not found");

      const [{ data: org }, { data: from }, { data: to }] = await Promise.all([
        sb.from("orgs").select("name").eq("id", req.org_id).single(),
        sb.from("accounts").select("name").eq("id", req.from_account_id).single(),
        sb.from("accounts").select("name").eq("id", req.to_account_id).single(),
      ]);

      const role = await requiredApproverRole(
        sb,
        req.org_id,
        req.to_account_id,
        req.amount,
      );

      const { data: approverEmails } = role
        ? await sb
            .from("memberships")
            .select("user_id,role,users:user_id(email)")
            .eq("org_id", req.org_id)
            .in("role", [role, "admin"])
        : { data: [] as { users?: { email?: string } }[] };

      const emails =
        (approverEmails ?? [])
          .map((m: { users?: { email?: string } }) => m.users?.email)
          .filter((e: string | undefined): e is string => !!e);

      return {
        req,
        org_name: org?.name ?? "Unknown",
        from_name: from?.name ?? "?",
        to_name: to?.name ?? "?",
        emails,
      };
    });

    await step.run("fan-out", () =>
      notifyApprovers(
        {
          org_name: ctx.org_name,
          request_id: ctx.req.id,
          amount: ctx.req.amount,
          currency: ctx.req.currency,
          from_account: ctx.from_name,
          to_account: ctx.to_name,
          requested_by: ctx.req.requested_by ?? "system",
          approval_url: `${process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000"}/approvals/${ctx.req.id}`,
        },
        ctx.emails,
      ),
    );

    return { notified: ctx.emails.length };
  },
);
