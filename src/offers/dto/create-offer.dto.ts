import { z } from 'zod';

export const CreateOfferSchema = z.object({
  title: z.string().min(1).max(200).optional(),
});

export type CreateOfferDto = z.infer<typeof CreateOfferSchema>;
