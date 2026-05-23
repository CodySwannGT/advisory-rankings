// @ts-nocheck
const MCP_PROTOCOL_VERSION = "2025-06-18";
const SERVER_INFO = {
  name: "advisorbook",
  title: "AdvisorBook",
  version: "0.1.0",
};

const JSON_RPC_VERSION = "2.0";
const PARSE_ERROR = -32700;
const INVALID_REQUEST = -32600;
const METHOD_NOT_FOUND = -32601;

/**
 * Public Streamable HTTP MCP endpoint.
 *
 * Harper maps JS resource export names directly to routes, so the lowercase
 * class name intentionally exposes POST /mcp.
 */
// eslint-disable-next-line sonarjs/class-name -- Harper maps this lowercase export to POST /mcp.
export class mcp extends Resource {
  /**
   * Allows unauthenticated MCP clients to initialize over Streamable HTTP.
   * @returns True because v1 MCP is public and read-only.
   */
  allowCreate() {
    return true;
  }

  /**
   * Handles one JSON-RPC request or batch request.
   * @param {...unknown} args - Harper POST arguments containing the JSON body.
   * @returns JSON-RPC response object, batch response, or null for notifications.
   */
  async post(...args) {
    return handleMcpRequest(extractJsonRpcBody(args));
  }
}

/**
 * Finds the parsed JSON-RPC body from Harper's variadic POST arguments.
 * @param args - Candidate arguments passed to the resource method.
 * @returns Parsed JSON-RPC body, or undefined when the request is malformed.
 */
export function extractJsonRpcBody(args) {
  return args.find(isJsonRpcCandidate) ?? args.find(isBodyCandidate);
}

/**
 * Handles a parsed MCP JSON-RPC body.
 * @param body - JSON-RPC request object or batch array.
 * @returns JSON-RPC response object, batch response, or null for notifications.
 */
export function handleMcpRequest(body) {
  if (body === undefined)
    return errorResponse(null, PARSE_ERROR, "Parse error");
  if (Array.isArray(body)) return handleBatch(body);
  return handleSingle(body);
}

/**
 * Handles a JSON-RPC batch request.
 * @param batch - Request array.
 * @returns Batch response array, error response, or null when all were notifications.
 */
function handleBatch(batch) {
  if (batch.length === 0)
    return errorResponse(null, INVALID_REQUEST, "Invalid Request");
  const responses = batch
    .map(handleSingle)
    .filter(response => response !== null);
  return responses.length > 0 ? responses : null;
}

/**
 * Handles one JSON-RPC request.
 * @param request - Request payload.
 * @returns JSON-RPC response or null for notifications.
 */
function handleSingle(request) {
  if (!isJsonRpcRequest(request))
    return errorResponse(
      requestId(request),
      INVALID_REQUEST,
      "Invalid Request"
    );
  if (isNotification(request)) return null;
  if (request.method === "initialize")
    return successResponse(request.id, initializeResult(request.params));
  return errorResponse(
    request.id,
    METHOD_NOT_FOUND,
    `Method not found: ${request.method}`
  );
}

/**
 * Builds the initialize result with only currently implemented capabilities.
 * @param params - Client initialize params.
 * @returns MCP initialize result.
 */
function initializeResult(params) {
  return {
    protocolVersion: requestedProtocolVersion(params),
    capabilities: {},
    serverInfo: SERVER_INFO,
  };
}

/**
 * Uses the client's requested protocol version when present.
 * @param params - Client initialize params.
 * @returns Protocol version to advertise.
 */
function requestedProtocolVersion(params) {
  return typeof params?.protocolVersion === "string"
    ? params.protocolVersion
    : MCP_PROTOCOL_VERSION;
}

/**
 * Builds a JSON-RPC success response.
 * @param id - Request id.
 * @param result - Response result payload.
 * @returns JSON-RPC success response.
 */
function successResponse(id, result) {
  return { jsonrpc: JSON_RPC_VERSION, id, result };
}

/**
 * Builds a JSON-RPC error response.
 * @param id - Request id, or null when unavailable.
 * @param code - JSON-RPC error code.
 * @param message - JSON-RPC error message.
 * @returns JSON-RPC error response.
 */
function errorResponse(id, code, message) {
  return {
    jsonrpc: JSON_RPC_VERSION,
    id,
    error: { code, message },
  };
}

/**
 * Checks for a JSON-RPC request-like value.
 * @param value - Candidate value.
 * @returns True when the value can be routed as JSON-RPC.
 */
function isJsonRpcCandidate(value) {
  return isJsonRpcRequest(value) || Array.isArray(value);
}

/**
 * Finds parsed but invalid JSON request bodies after valid candidates fail.
 * @param value - Candidate value.
 * @returns True when the value is a plain request body.
 */
function isBodyCandidate(value) {
  if (!value || typeof value !== "object") return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

/**
 * Checks for a valid JSON-RPC request shape.
 * @param value - Candidate value.
 * @returns True when the request has JSON-RPC 2.0 and a string method.
 */
function isJsonRpcRequest(value) {
  return (
    value &&
    typeof value === "object" &&
    value.jsonrpc === JSON_RPC_VERSION &&
    typeof value.method === "string"
  );
}

/**
 * Returns whether a JSON-RPC request is a notification.
 * @param request - JSON-RPC request.
 * @returns True when there is no id field.
 */
function isNotification(request) {
  return !Object.hasOwn(request, "id");
}

/**
 * Safely extracts a request id for invalid-request responses.
 * @param request - Candidate request.
 * @returns Request id or null when unavailable.
 */
function requestId(request) {
  return request &&
    typeof request === "object" &&
    (typeof request.id === "string" ||
      typeof request.id === "number" ||
      request.id === null)
    ? request.id
    : null;
}
