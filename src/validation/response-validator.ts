import { z } from 'zod';

/**
 * Attempt to parse and validate a raw LLM response string against a Zod schema.
 *
 * Strategy (anti-hallucination):
 * 1. Try direct JSON.parse
 * 2. Try extracting JSON from markdown code blocks (```json ... ```)
 * 3. Try extracting first { ... } or [ ... ] from the text
 * 4. Fail with structured error
 */
export function validateResponse<T>(
  schema: z.ZodType<T>,
  raw: string,
): { success: true; data: T } | { success: false; error: string; raw: string } {
  const jsonString = extractJson(raw);

  if (!jsonString) {
    return {
      success: false,
      error: 'Could not extract JSON from response. Got prose or malformed output.',
      raw,
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch {
    return {
      success: false,
      error: `JSON parse error: invalid JSON syntax`,
      raw: jsonString,
    };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    return {
      success: false,
      error: `Schema validation failed: ${issues}`,
      raw: jsonString,
    };
  }

  return { success: true, data: result.data };
}

/**
 * Extract JSON from potentially wrapped LLM output.
 * Handles: raw JSON, markdown fences, JSON buried in prose.
 */
function extractJson(raw: string): string | null {
  const trimmed = raw.trim();

  // Direct JSON object or array
  if (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  ) {
    return trimmed;
  }

  // Markdown code block: ```json ... ``` or ``` ... ```
  const fenceMatch = trimmed.match(/```(?:json)?\s*\n?([\s\S]*?)\n?```/);
  if (fenceMatch) {
    return fenceMatch[1].trim();
  }

  // Last resort: find first { ... } or [ ... ] with balanced braces
  const braceStart = trimmed.indexOf('{');
  const bracketStart = trimmed.indexOf('[');
  const start = braceStart === -1 ? bracketStart
    : bracketStart === -1 ? braceStart
    : Math.min(braceStart, bracketStart);

  if (start === -1) return null;

  const openChar = trimmed[start];
  const closeChar = openChar === '{' ? '}' : ']';
  let depth = 0;

  for (let i = start; i < trimmed.length; i++) {
    if (trimmed[i] === openChar) depth++;
    if (trimmed[i] === closeChar) depth--;
    if (depth === 0) {
      return trimmed.slice(start, i + 1);
    }
  }

  return null;
}
