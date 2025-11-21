import { z } from 'zod';

export const SaveStepSchema = z.object({
  step_key: z.string().min(1),
  data: z.record(z.string(), z.unknown()), // obiect JSON arbitrar
});

export type SaveStepDto = z.infer<typeof SaveStepSchema>;
