import type { Hook } from '@hono/zod-openapi'
import type { Env } from '@hono/hono'
import { z } from '@hono/zod-openapi'

export function errorHook<E extends Env>(): Hook<any, E, any, any> {
  return (result, c) => {
    if (!result.success) {
      return c.json(
        {
          ok: false,
          problem: 'ZOD parsing error',
          error: result.error,
        },
        422,
      )
    }
  }
}

export function errorResponse_422() {
  return {
    description: 'Returns a problem with request parsing',
    content: {
      'application/json': {
        schema: z.object({
          ok: z.boolean().openapi({
            example: false,
            default: false,
            description: 'A boolean that is always false indicating an error',
          }),
          problem: z.string().openapi({
            description: 'A description of the problem',
            example: 'ZOD parsing error',
          }),
          error: z.any().optional().openapi({
            description: 'A detailed fail information',
          }),
        }),
      },
    },
  }
}

export function plainError() {
  return {
    schema: z.string().openapi({
      description: 'Represents an error with the request',
      example: 'Invalid apikey',
    }),
  }
}

export function response_400(status: string, emptyStauts = false) {
  const schema = !emptyStauts
    ? z.object({
      status: z.string().openapi({
        example: status,
        description: 'A short description explaining the error',
      }),
      error: z.any().optional().openapi({
        description: 'A detailed fail information',
      }),
    }).or(
      z.object({
        status: z.string().openapi({
          example: 'You can\'t access this app',
          description: 'A short description explaining the error',
        }),
        app_id: z.string(),
      }),
    )
    : z.object({
      status: z.string().openapi({
        example: status,
        description: 'A short description explaining the error',
      }),
      error: z.any().optional().openapi({
        description: 'A detailed fail information',
      }),
    }).or(
      z.object({
        status: z.string().openapi({
          example: 'You can\'t access this app',
          description: 'A short description explaining the error',
        }),
        app_id: z.string(),
      }),
    ).or(
      z.object({
        status: z.string().openapi({
          description: 'Invalid request',
          example: 'ok',
        }),
      }),
    )

  return {
    description: 'Returns a problem with the request',
    content: {
      'application/json': {
        schema,
      },
      'text/plain': plainError(),
    },
  }
}

export function error_500(status: string) {
  return {
    description: 'Returns an internal error',
    content: {
      'application/json': {
        schema: z.object({
          status: z.string().openapi({
            example: status,
            description: 'A short description explaining the error',
          }),
          error: z.any().optional().openapi({
            description: 'A detailed fail information',
          }),
        }),
      },
    },
  }
}
