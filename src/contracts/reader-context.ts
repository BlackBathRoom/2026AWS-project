import { z } from 'zod';

// Browser text helps resolve references such as "this page". It is never evidence
// or authorization; only the server-configured Knowledge Base supplies evidence.
export const readerContextSchema = z.object({
  filename: z.string().min(1).max(100),
  page: z.number().int().min(1).max(10000),
  text: z.string().max(4000),
}).strict();

export type ReaderContext = z.infer<typeof readerContextSchema>;
