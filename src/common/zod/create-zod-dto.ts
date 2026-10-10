import { ApiProperty } from '@nestjs/swagger';
import { z } from 'zod';

/**
 * A request/response contract backed by a zod schema.
 *
 * The class exists so Nest's DI, `@Body()` reflection and `@nestjs/swagger` model
 * generation work; the schema is the single source of truth. `ZodValidationPipe`
 * enforces it at runtime, and `createZodDto` projects it into OpenAPI, so the
 * documentation cannot drift from the actual validation rules.
 */
export interface ZodDto<T extends z.ZodType = z.ZodType> {
  /** Schema used for runtime validation. */
  readonly schema: T;
}

type JsonSchema = Record<string, unknown>;

/**
 * Derives an OpenAPI 3.0 schema from a zod schema.
 *
 * zod 4 targets OpenAPI 3.0 natively, which means nullable unions become
 * `nullable: true` instead of the `{ "type": "null" }` construct that OpenAPI 3.0
 * cannot represent.
 */
export function toOpenApiSchema(schema: z.ZodType): JsonSchema {
  const jsonSchema = z.toJSONSchema(schema, {
    target: 'openapi-3.0',
    io: 'input',
    reused: 'inline',
    unrepresentable: 'any',
  }) as JsonSchema;

  // `$schema` is a JSON-Schema keyword that OpenAPI 3.0 does not understand.
  delete jsonSchema.$schema;
  return jsonSchema;
}

/**
 * Builds the DTO base class for a zod schema.
 *
 * Callers use it through the class-extends form:
 *
 * ```ts
 * export class UpdateProfileDto extends createZodDto(schema) {}
 * ```
 *
 * A real class declaration matters here: TypeScript only records a parameter's
 * runtime type in `design:paramtypes` when the annotation is a class *value*. An
 * `InstanceType<typeof Dto>` alias erases to `Object`, and `@nestjs/swagger` then
 * has no model to document, producing an operation with no request body.
 */
export function createZodDto<TSchema extends z.ZodType>(schema: TSchema): {
  new (): z.output<TSchema>;
  readonly schema: TSchema;
} {
  const openApiSchema = toOpenApiSchema(schema);
  const properties = (openApiSchema.properties ?? {}) as Record<string, JsonSchema>;
  const required = new Set((openApiSchema.required as string[] | undefined) ?? []);

  class GeneratedDto {
    /** Schema used by the global validation pipe. */
    static readonly schema: TSchema = schema;
    /** Cached OpenAPI projection, exposed for tests and debugging. */
    static readonly openApiSchema: JsonSchema = openApiSchema;
  }

  const prototype = GeneratedDto.prototype as unknown as Record<string, unknown>;
  for (const [propertyName, propertySchema] of Object.entries(properties)) {
    // Declaring the field keeps `@nestjs/swagger`'s model explorer happy; the
    // runtime value is never read because the pipe replaces the payload.
    Object.defineProperty(prototype, propertyName, {
      value: undefined,
      writable: true,
      enumerable: false,
      configurable: true,
    });

    const options = {
      ...propertySchema,
      required: required.has(propertyName),
    } as Parameters<typeof ApiProperty>[0];

    ApiProperty(options)(prototype, propertyName);
  }

  return GeneratedDto as unknown as { new (): z.output<TSchema>; readonly schema: TSchema };
}