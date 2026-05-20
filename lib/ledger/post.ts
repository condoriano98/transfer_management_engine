import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const JournalLine = z.object({
  account_code: z.string().min(1),
  direction: z.enum(["debit", "credit"]),
  amount: z.number().int().positive(),
  currency: z.string().length(3).default("IDR"),
});
export type JournalLine = z.infer<typeof JournalLine>;

export const JournalInput = z.object({
  org_id: z.string().uuid(),
  memo: z.string().min(1),
  ref: z.string().optional(),
  lines: z.array(JournalLine).min(2),
});
export type JournalInput = z.infer<typeof JournalInput>;

/**
 * Post a journal atomically. The DB function `post_journal` validates that
 * sum(debits) == sum(credits) and inserts entries inside one transaction.
 * Returns the new journal id.
 */
export async function postJournal(
  sb: SupabaseClient,
  input: JournalInput,
): Promise<string> {
  const parsed = JournalInput.parse(input);

  const debits = parsed.lines
    .filter((l) => l.direction === "debit")
    .reduce((s, l) => s + l.amount, 0);
  const credits = parsed.lines
    .filter((l) => l.direction === "credit")
    .reduce((s, l) => s + l.amount, 0);
  if (debits !== credits) {
    throw new Error(`unbalanced journal: debits=${debits}, credits=${credits}`);
  }

  const { data, error } = await sb.rpc("post_journal", {
    p_org_id: parsed.org_id,
    p_memo: parsed.memo,
    p_ref: parsed.ref ?? null,
    p_lines: parsed.lines,
  });
  if (error) throw error;
  return data as string;
}
