import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

interface SqlExecuteRequest {
  action?: "execute" | "metadata";
  query?: string;
}

interface SqlExecuteResponse {
  status: "ok" | "error";
  message?: string;
  rows?: any[];
  columns?: Array<{
    name: string;
    type?: string | null;
    fullType?: string | null;
    nullable?: boolean | null;
    jsType?: string | null;
    description?: string | null;
    maxLength?: number | null;
    precision?: number | null;
    scale?: number | null;
    display?: { title?: string | null; width?: number | null; align?: "left" | "center" | "right" | null };
  }>;
  command_tag?: string;
  row_count?: number;
  duration_ms?: number;
  notices?: string[];
  warnings?: string[];
  query_text?: string;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-requested-with",
    "Access-Control-Max-Age": "86400",
  };
}

function getClientIp(req: Request): { ip: string | null; forwardedFor: string | null } {
  const xff = req.headers.get("x-forwarded-for");
  const xRealIp = req.headers.get("x-real-ip");
  const cfIp = req.headers.get("cf-connecting-ip");
  const forwardedFor = xff ?? null;
  const candidate = (cfIp ?? xRealIp ?? xff ?? "").trim();
  const ip = candidate ? candidate.split(",")[0].trim() : null;
  return { ip, forwardedFor };
}

function normalizeQuery(raw: string): string {
  return raw.trim().replace(/;+\s*$/g, "");
}

// WITH can contain data-modifying CTEs; EXPLAIN ANALYZE executes its child statement.
const READ_ONLY_SQL_PATTERN = /^(SELECT|SHOW|VALUES|TABLE)\b/i;

function isReadOnlyQuery(query: string): boolean {
  return READ_ONLY_SQL_PATTERN.test(query.trimStart());
}

function mapPostgresTypeToJSType(pgType?: string | null): string {
  if (!pgType) return "string";
  const t = pgType.toLowerCase();
  if (t.includes("int") || t === "numeric" || t === "decimal" || t.includes("double") || t.includes("float")) return "number";
  if (t.includes("char") || t.includes("text") || t === "uuid" || t === "inet" || t === "cidr") return "string";
  if (t.includes("time") || t.includes("timestamp") || t === "date") return "date";
  if (t === "boolean" || t === "bool") return "boolean";
  if (t.includes("json")) return "json";
  return "string";
}

function formatErrorMessage(errorMessage: string): string {
  let msg = errorMessage.replace(/^Failed to run sql query:\s*/i, "");
  if (msg.trim().startsWith("ERROR:")) return `Failed to run sql query: ${msg.trim()}`;
  if (!msg.trim().startsWith("ERROR:")) msg = `ERROR: ${msg.trim()}`;
  return `Failed to run sql query: ${msg}`;
}

function processColumns(columns: any[]): SqlExecuteResponse["columns"] {
  if (!columns || !Array.isArray(columns)) return [];
  return columns.map((col: any) => {
    const jsType = col.jsType || (col.type ? mapPostgresTypeToJSType(col.type) : "string");
    return {
      name: col.name || "",
      type: col.type || null,
      fullType: col.fullType || col.type || null,
      nullable: col.nullable !== undefined ? col.nullable : true,
      jsType,
      description: col.description || null,
      maxLength: col.maxLength || null,
      precision: col.precision || null,
      scale: col.scale || null,
      display: col.display || { title: col.name || null, width: null, align: null },
    };
  });
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const { ip, forwardedFor } = getClientIp(req);
  const userAgent = req.headers.get("user-agent");
  const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...cors, "Content-Type": "application/json" },
    });

  const writeAudit = async (payload: {
    auth_user_id?: string | null;
    auth_email?: string | null;
    query_text: string;
    is_write: boolean;
    status: "ok" | "error";
    error_message?: string | null;
    command_tag?: string | null;
    row_count?: number | null;
    duration_ms?: number | null;
  }) => {
    try {
      await supabaseAdmin.from("sys_audit_log").insert({
        auth_user_id: payload.auth_user_id ?? null,
        auth_email: payload.auth_email ?? null,
        ip,
        forwarded_for: forwardedFor,
        user_agent: userAgent,
        query_text: payload.query_text,
        is_write: payload.is_write,
        status: payload.status,
        error_message: payload.error_message ?? null,
        command_tag: payload.command_tag ?? null,
        row_count: payload.row_count ?? null,
        duration_ms: payload.duration_ms ?? null,
      });
    } catch (e) {
      console.error("Failed to write audit log:", e);
    }
  };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      await writeAudit({ query_text: "", is_write: false, status: "error", error_message: "Missing authorization header" });
      return json({ status: "error", message: "Missing authorization header" } satisfies SqlExecuteResponse, 401);
    }

    const authClient = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await authClient.auth.getUser(token);

    if (authError || !user) {
      await writeAudit({ query_text: "", is_write: false, status: "error", error_message: "Invalid or expired token" });
      return json({ status: "error", message: "Invalid or expired token" } satisfies SqlExecuteResponse, 401);
    }

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data: isSuper, error: superError } = await userClient.rpc("current_is_super");
    if (superError) {
      await writeAudit({
        auth_user_id: user.id,
        auth_email: user.email ?? null,
        query_text: "",
        is_write: false,
        status: "error",
        error_message: `Failed to check superuser status: ${superError.message}`,
      });
      return json({ status: "error", message: "Failed to verify SQL console permission" } satisfies SqlExecuteResponse, 500);
    }

    const body: SqlExecuteRequest = await req.json();
    if (body?.action === "metadata") {
      const { data, error } = await supabaseAdmin.rpc("get_database_metadata_all");
      if (error) {
        return json({ status: "error", message: error.message } satisfies SqlExecuteResponse, 500);
      }
      return json(data);
    }

    const rawQuery = body?.query;
    if (!rawQuery || typeof rawQuery !== "string" || rawQuery.trim() === "") {
      await writeAudit({
        auth_user_id: user.id,
        auth_email: user.email ?? null,
        query_text: String(rawQuery ?? ""),
        is_write: false,
        status: "error",
        error_message: "Query is required and must be a non-empty string",
      });
      return json({ status: "error", message: "Query is required and must be a non-empty string", query_text: rawQuery } satisfies SqlExecuteResponse, 400);
    }

    const queryText = normalizeQuery(rawQuery);
    if (queryText.includes(";")) {
      await writeAudit({
        auth_user_id: user.id,
        auth_email: user.email ?? null,
        query_text: queryText,
        is_write: false,
        status: "error",
        error_message: "Multiple statements are not allowed (unexpected ';').",
      });
      return json({ status: "error", message: "Multiple statements are not allowed (unexpected ';').", query_text: queryText } satisfies SqlExecuteResponse, 400);
    }

    const startTime = Date.now();
    const isWriteOperation = !isReadOnlyQuery(queryText);

    if (isWriteOperation && !isSuper) {
      const permissionMessage = "Permission denied: write and DDL statements are restricted to platform super administrators";
      await writeAudit({
        auth_user_id: user.id,
        auth_email: user.email ?? null,
        query_text: queryText,
        is_write: true,
        status: "error",
        error_message: permissionMessage,
      });
      return json({
        status: "error",
        message: permissionMessage,
        query_text: queryText,
      } satisfies SqlExecuteResponse, 403);
    }

    const { data, error, status: rpcStatus } = await supabaseAdmin.rpc("execute_sql_query", {
      sql_query: queryText,
    });

    const durationMs = Date.now() - startTime;
    const result = data as any;

    if (error) {
      const pgMessage = error.message || "SQL execution failed";
      await writeAudit({
        auth_user_id: user.id,
        auth_email: user.email ?? null,
        query_text: queryText,
        is_write: isWriteOperation,
        status: "error",
        error_message: pgMessage,
        duration_ms: durationMs,
      });
      return json({ status: "error", message: formatErrorMessage(pgMessage), query_text: queryText, duration_ms: durationMs } satisfies SqlExecuteResponse, rpcStatus || 500);
    }

    if (result?.error) {
      const pgMessage = result.error_message || "SQL execution failed";
      await writeAudit({
        auth_user_id: user.id,
        auth_email: user.email ?? null,
        query_text: queryText,
        is_write: isWriteOperation,
        status: "error",
        error_message: pgMessage,
        duration_ms: result.duration_ms || durationMs,
      });
      return json({ status: "error", message: formatErrorMessage(pgMessage), query_text: queryText, duration_ms: result.duration_ms || durationMs } satisfies SqlExecuteResponse, 500);
    }

    return json({
      status: "ok",
      rows: result?.rows || [],
      columns: processColumns(result?.columns || []),
      command_tag: result?.command_tag || (isWriteOperation ? "WRITE" : "SELECT"),
      row_count: result?.row_count ?? 0,
      duration_ms: result?.duration_ms || durationMs,
      notices: result?.notices || [],
      warnings: result?.warnings || [],
      query_text: queryText,
    } satisfies SqlExecuteResponse, 200);
  } catch (error) {
    try {
      const supabaseAdminFallback = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
      await supabaseAdminFallback.from("sys_audit_log").insert({
        query_text: "",
        is_write: false,
        status: "error",
        error_message: error instanceof Error ? error.message : "Unknown error",
        ip,
        forwarded_for: forwardedFor,
        user_agent: userAgent,
      });
    } catch {
      // ignore
    }

    return json({
      status: "error",
      message: `Failed to run sql query: ${error instanceof Error ? error.message : "Unknown error"}`,
    } satisfies SqlExecuteResponse, 500);
  }
});

