/**
 * Minimal JSON Schema validation covering the subset used by the diagram
 * tools: objects with typed properties, required lists, enums, arrays and
 * nested objects. Unknown keys are stripped (models sometimes add stray
 * fields); type mismatches and missing required fields are hard errors so
 * the model gets a correctable message back.
 */

export type JsonSchema = {
  type?: 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array' | ['string', 'null']
  description?: string
  enum?: (string | number | null)[]
  properties?: Record<string, JsonSchema>
  required?: string[]
  items?: JsonSchema
  additionalProperties?: boolean
  minimum?: number
  maximum?: number
  minItems?: number
}

export class SchemaError extends Error {}

export function validateArgs(
  schema: JsonSchema,
  value: unknown,
  path = 'arguments',
): unknown {
  if (schema.enum) {
    if (!schema.enum.includes(value as string | number | null)) {
      throw new SchemaError(`${path} must be one of ${schema.enum.map((v) => JSON.stringify(v)).join(', ')}`)
    }
    return value
  }

  const types = Array.isArray(schema.type) ? schema.type : schema.type ? [schema.type] : []
  if (types.includes('null' as never) && value === null) return null

  switch (types[0]) {
    case 'object': {
      if (typeof value !== 'object' || value === null || Array.isArray(value)) {
        throw new SchemaError(`${path} must be an object`)
      }
      const input = value as Record<string, unknown>
      const out: Record<string, unknown> = {}
      const props = schema.properties ?? {}
      for (const key of schema.required ?? []) {
        if (input[key] === undefined || input[key] === null) {
          throw new SchemaError(`${path}.${key} is required`)
        }
      }
      for (const [key, propSchema] of Object.entries(props)) {
        const v = input[key]
        if (v === undefined) continue
        out[key] = validateArgs(propSchema, v, `${path}.${key}`)
      }
      return out
    }
    case 'string': {
      if (typeof value !== 'string') throw new SchemaError(`${path} must be a string`)
      return value
    }
    case 'number':
    case 'integer': {
      if (typeof value !== 'number' || Number.isNaN(value)) {
        throw new SchemaError(`${path} must be a number`)
      }
      if (schema.minimum !== undefined && value < schema.minimum) {
        throw new SchemaError(`${path} must be >= ${schema.minimum}`)
      }
      if (schema.maximum !== undefined && value > schema.maximum) {
        throw new SchemaError(`${path} must be <= ${schema.maximum}`)
      }
      return value
    }
    case 'boolean': {
      if (typeof value !== 'boolean') throw new SchemaError(`${path} must be a boolean`)
      return value
    }
    case 'array': {
      if (!Array.isArray(value)) throw new SchemaError(`${path} must be an array`)
      if (schema.minItems !== undefined && value.length < schema.minItems) {
        throw new SchemaError(`${path} must have at least ${schema.minItems} items`)
      }
      return schema.items
        ? value.map((v, i) => validateArgs(schema.items!, v, `${path}[${i}]`))
        : value
    }
    default:
      return value
  }
}
