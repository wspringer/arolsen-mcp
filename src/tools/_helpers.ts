import type { z } from "zod";
import type { ErrorOutput } from "../schemas.js";
import type { ArolsenError } from "../types.js";

type Err = z.infer<typeof ErrorOutput>;

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "resource_link"; uri: string; mimeType: string; name: string };

// Includes [k: string]: unknown so it structurally matches the
// MCP SDK's CallToolResult ($loose Zod object) without casts at the
// registration site.
export type ToolResult<T> = {
  content: ContentBlock[];
  structuredContent: T;
  isError?: boolean;
  [k: string]: unknown;
};

/**
 * Run a tool's happy-path closure and translate any thrown ArolsenError
 * into a structured isError response. Every tool handler shares this
 * envelope shape, so factoring out the try/catch removes a lot of
 * copy-pasted error-mapping code.
 *
 * The cursor-decoding step in arolsen_search_results throws an
 * ArolsenError too, so it routes through here naturally.
 */
export async function wrapToolErrors<T>(
  fn: () => Promise<ToolResult<T>>,
  prefix: string,
): Promise<ToolResult<T | Err>> {
  try {
    return await fn();
  } catch (e: unknown) {
    const err = e as ArolsenError;
    const errOut: Err = {
      error_code: err.code ?? "upstream_5xx",
      retry_after: err.retryAfter,
    };
    return {
      isError: true,
      structuredContent: errOut,
      content: [{ type: "text", text: `${prefix}: ${err.message}` }],
    };
  }
}
