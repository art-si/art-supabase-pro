import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.3";
import { prepareSqlInput } from "./sql-input.ts";

interface SqlExecuteRequest {
  action?: "execute" | "metadata" | "explain";
  query?: string;
  maxRows?: number;
  timeoutMs?: number;
}

interface SqlExecuteResponse {
  status: "ok" | "error";
  message?: string;
  rows?: Array<Record<string, unknown>>;
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
  truncated?: boolean;
  max_rows?: number;
  timeout_ms?: number;
  executionScope?: "database";
  plan?: unknown;
  estimatedCost?: number;
  estimatedRows?: number;
  planningTimeMs?: number;
}

const DEFAULT_MAX_ROWS = 200;
const MAX_ROWS = 1000;
const DEFAULT_TIMEOUT_MS = 10_000;
const MAX_TIMEOUT_MS = 30_000;

function boundedInteger(value: unknown, fallback: number, maximum: number): number | null {
  if (value === undefined) return fallback;
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= maximum ? value : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function formatErrorPosition(error: unknown, queryText: string, prefixLength: number): string {
  if (!isRecord(error)) return "";
  const position = Number(error.position);
  const queryPosition = position - prefixLength;
  if (!Number.isInteger(queryPosition) || queryPosition < 1 || queryPosition > queryText.length) return "";
  const before = queryText.slice(0, queryPosition - 1);
  const line = before.split("\n").length;
  const column = before.length - before.lastIndexOf("\n");
  const lineText = queryText.split("\n")[line - 1] ?? "";
  return `\nLINE ${line}: ${lineText}\n${" ".repeat(6 + String(line).length + column)}^`;
}

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "Access-Control-Allow-Origin": origin,
    Vary: "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-requested-with, x-art-tenant-scope",
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

// WITH can contain data-modifying CTEs; EXPLAIN ANALYZE executes its child statement.
const READ_ONLY_SQL_PATTERN = /^(SELECT|SHOW|VALUES|TABLE)\b/i;

function isReadOnlyQuery(keyword: string): boolean {
  return READ_ONLY_SQL_PATTERN.test(keyword);
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

function processColumns(columns: NonNullable<SqlExecuteResponse["columns"]>): SqlExecuteResponse["columns"] {
  return columns.map((col) => {
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
      const { error } = await supabaseAdmin.from("sys_audit_log").insert({
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
      if (error) console.error("Failed to write SQL console audit log:", error);
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
      global: { headers: {
        Authorization: authHeader,
        ...(req.headers.get("x-art-tenant-scope") ? { "x-art-tenant-scope": req.headers.get("x-art-tenant-scope")! } : {}),
      } },
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
      const { data, error } = await userClient.rpc("get_sql_console_metadata");
      if (error) {
        return json({ status: "error", message: "数据库结构加载失败，请稍后重试" } satisfies SqlExecuteResponse, 500);
      }
      return json(data);
    }

    if (body?.action !== undefined && body.action !== "execute" && body.action !== "explain") {
      return json({ status: "error", message: "不支持的 SQL 操作" } satisfies SqlExecuteResponse, 400);
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

    const inspected = prepareSqlInput(rawQuery);
    const queryText = inspected.query;
    if (!queryText) {
      return json({ status: "error", message: "请输入有效的 SQL 语句" } satisfies SqlExecuteResponse, 400);
    }
    const maxRows = boundedInteger(body.maxRows, DEFAULT_MAX_ROWS, MAX_ROWS);
    const timeoutMs = boundedInteger(body.timeoutMs, DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);
    if (queryText.length > 100_000 || maxRows === null || timeoutMs === null) {
      return json({ status: "error", message: "SQL 或执行限制参数无效" } satisfies SqlExecuteResponse, 400);
    }
    if (inspected.multipleStatements) {
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
    if (body.action === "explain" && (inspected.keyword === "EXPLAIN" || inspected.keyword === "ANALYZE")) {
      return json({ status: "error", message: "请输入要分析的 SQL，执行计划选项由控制台统一设置" } satisfies SqlExecuteResponse, 400);
    }

    const startTime = Date.now();
    const isWriteOperation = !isReadOnlyQuery(inspected.keyword);

    if (!isSuper) {
      const permissionMessage = "SQL 执行与执行计划仅对平台超级管理员开放";
      await writeAudit({
        auth_user_id: user.id,
        auth_email: user.email ?? null,
        query_text: queryText,
        is_write: isWriteOperation,
        status: "error",
        error_message: permissionMessage,
      });
      return json({
        status: "error",
        message: permissionMessage,
        query_text: queryText,
      } satisfies SqlExecuteResponse, 403);
    }

    const connectionString = Deno.env.get("SUPABASE_DB_URL");
    if (!connectionString) {
      return json({ status: "error", message: "数据库连接尚未配置，请联系管理员" } satisfies SqlExecuteResponse, 503);
    }

    const canWrap = ["SELECT", "WITH", "VALUES", "TABLE"].includes(inspected.keyword);
    const returningMutation = ["INSERT", "UPDATE", "DELETE", "MERGE"].includes(inspected.keyword) && /\bRETURNING\b/i.test(queryText);
    const explainPrefix = "EXPLAIN (FORMAT JSON, ANALYZE FALSE) ";
    const selectPrefix = "SELECT * FROM (";
    const mutationPrefix = "WITH _sql_console_mutation AS (";
    const errorPrefixLength = body.action === "explain" ? explainPrefix.length : canWrap ? selectPrefix.length : returningMutation ? mutationPrefix.length : 0;

    // Transaction-pool compatible. The timeout must be set in a separate SQL
    // statement before the user statement; changing it inside an RPC is too late.
    const notices: string[] = [];
    const warnings: string[] = [];
    const db = postgres(connectionString, {
      prepare: false,
      max: 1,
      connect_timeout: 5,
      onnotice: (notice) => {
        const message = notice.message;
        if (!message) return;
        if (notice.severity === "WARNING") warnings.push(message);
        else notices.push(message);
      },
    });
    try {
      const result = await db.begin(async (tx) => {
        await tx`SELECT set_config('statement_timeout', ${String(timeoutMs)}, true)`;
        if (canWrap) await tx`SELECT set_config('transaction_read_only', 'on', true)`;
        if (body.action === "explain") {
          const explained = await tx.unsafe(`${explainPrefix}${queryText}`);
          const plan: unknown = explained[0]?.["QUERY PLAN"] ?? null;
          return { mode: "explain" as const, plan };
        }

        const executed = canWrap
          ? await tx.unsafe(`${selectPrefix}${queryText}\n) AS _sql_console_result LIMIT ${maxRows + 1}`)
          : returningMutation
            ? await tx.unsafe(`${mutationPrefix}${queryText}\n)
                SELECT
                  (SELECT count(*) FROM _sql_console_mutation) AS affected_rows,
                  (SELECT coalesce(jsonb_agg(to_jsonb(_shown)), '[]'::jsonb)
                     FROM (SELECT * FROM _sql_console_mutation LIMIT ${maxRows + 1}) AS _shown) AS displayed_rows`)
            : await tx.unsafe(queryText);
        const mutationResult = returningMutation && isRecord(executed[0]) ? executed[0] : null;
        const returnedRows = mutationResult && Array.isArray(mutationResult.displayed_rows) ? mutationResult.displayed_rows : executed;
        const rows = Array.from(returnedRows, (row) => isRecord(row) ? { ...row } : {});
        const truncated = rows.length > maxRows;
        if (truncated) rows.length = maxRows;
        const nativeColumns = returningMutation ? [] : executed.columns ?? [];
        const oidList = nativeColumns
          .map((column) => column.type)
          .filter((oid): oid is number => typeof oid === "number" && Number.isInteger(oid) && oid > 0);
        const typeRows = oidList.length > 0
          ? await tx.unsafe(`SELECT oid::int AS oid, pg_catalog.format_type(oid, NULL) AS full_type
              FROM pg_catalog.pg_type WHERE oid IN (${[...new Set(oidList)].join(",")})`)
          : [];
        const typeByOid = new Map(typeRows.map((row) => [Number(row.oid), String(row.full_type)]));
        const columns = returningMutation
          ? Object.entries(rows[0] ?? {}).map(([name, value]) => ({ name, type: value === null ? null : Array.isArray(value) ? "array" : typeof value === "object" ? "jsonb" : typeof value === "number" ? "numeric" : typeof value === "boolean" ? "boolean" : "text" }))
          : nativeColumns.map((column) => ({ name: column.name, type: typeByOid.get(column.type) ?? null, fullType: typeByOid.get(column.type) ?? null }));
        return {
          mode: "execute" as const,
          rows,
          columns,
          rowCount: returningMutation ? Number(mutationResult?.affected_rows ?? rows.length) : canWrap ? rows.length : (executed.count ?? rows.length),
          commandTag: returningMutation ? queryText.match(/^[A-Z]+/i)?.[0].toUpperCase() ?? "SQL" : canWrap ? "SELECT" : (executed.command ?? "SQL"),
          truncated,
        };
      });

      const durationMs = Date.now() - startTime;
      await writeAudit({
        auth_user_id: user.id,
        auth_email: user.email ?? null,
        query_text: queryText,
        is_write: isWriteOperation,
        status: "ok",
        command_tag: result.mode === "execute" ? result.commandTag : "EXPLAIN",
        row_count: result.mode === "execute" ? result.rowCount : 0,
        duration_ms: durationMs,
      });

      if (result.mode === "explain") {
        const planRoot = Array.isArray(result.plan) && isRecord(result.plan[0]) ? result.plan[0] : null;
        const node = planRoot && isRecord(planRoot.Plan) ? planRoot.Plan : null;
        return json({
          status: "ok",
          plan: result.plan,
          estimatedCost: typeof node?.["Total Cost"] === "number" ? node["Total Cost"] : undefined,
          estimatedRows: typeof node?.["Plan Rows"] === "number" ? node["Plan Rows"] : undefined,
          planningTimeMs: typeof planRoot?.["Planning Time"] === "number" ? planRoot["Planning Time"] : undefined,
          duration_ms: durationMs,
          timeout_ms: timeoutMs,
          notices,
          warnings,
          executionScope: "database",
          query_text: queryText,
        } satisfies SqlExecuteResponse);
      }

      return json({
        status: "ok",
        rows: result.rows,
        columns: processColumns(result.columns),
        command_tag: result.commandTag,
        row_count: result.rowCount,
        duration_ms: durationMs,
        truncated: result.truncated,
        max_rows: maxRows,
        timeout_ms: timeoutMs,
        notices,
        warnings,
        executionScope: "database",
        query_text: queryText,
      } satisfies SqlExecuteResponse);
    } catch (error) {
      const durationMs = Date.now() - startTime;
      const pgMessage = error instanceof Error ? error.message : "SQL execution failed";
      await writeAudit({
        auth_user_id: user.id,
        auth_email: user.email ?? null,
        query_text: queryText,
        is_write: isWriteOperation,
        status: "error",
        error_message: pgMessage,
        duration_ms: durationMs,
      });
      return json({
        status: "error",
        message: pgMessage.includes("statement timeout") ? "SQL 执行超时，请缩小查询范围后重试" : formatErrorMessage(pgMessage) + formatErrorPosition(error, queryText, errorPrefixLength),
        duration_ms: durationMs,
        query_text: queryText,
        executionScope: "database",
      } satisfies SqlExecuteResponse, 500);
    } finally {
      try {
        await db.end();
      } catch (closeError) {
        console.error("Failed to close SQL console database connection:", closeError);
      }
    }
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

