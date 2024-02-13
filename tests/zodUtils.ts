import { APIResponse, expect as baseExport } from '@playwright/test'
import { ZodTypeAny, z } from 'zod';

const zodErrorScheme = z.object({
    error: z.string()
}) 

export const expect = baseExport.extend({
    async toMatchSchema(received: any, schema: ZodTypeAny) {
      const response = received
      const result = await schema.safeParseAsync(response);
      if (result.success) {
        return {
          message: () => "schema matched",
          pass: true,
        };
      } else {
        return {
          message: () =>
            "Result does not match schema: " +
            result.error.issues.map((issue) => issue.message).join("\n") +
            "\n" +
            "Details: " +
            JSON.stringify(result.error, null, 2) +
            "Full response:\n" +
            JSON.stringify(response),
          pass: false,
        };
      }
    },
    async toHaveError(received: APIResponse, error: string) {
        const response = await received.json()
        await expect(response).toMatchSchema(zodErrorScheme)
        const result = zodErrorScheme.parse(response)
        
        if (result.error === error) {
          return {
            message: () => "Error matched",
            pass: true,
          };
        } else {
          return {
            message: () => `Response error ${result.error} !== ${error}`,
            pass: false
          }
        }
      },
  });