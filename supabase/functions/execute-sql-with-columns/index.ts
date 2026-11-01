import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import postgres from "npm:postgres@3.4.3";
import { prepareSqlInput } from "./sql-input.ts";
import { createQueryCancellation, SqlQueryCancelledError, type CancellableSqlQuery } from "../_shared/query-cancellation.ts";
import { metadataRpcInput } from "./metadata-input.ts";
import { mapSqlErrorPosition, type SqlErrorLocation } from "./error-position.ts";

interface SqlExecuteRequest {
  action?: "execute" | "metadata" | "explain" | "cancel";
  requestId?: string;
  query?: string;
  maxRows?: number;
  timeoutMs?: number;
  mode?: "catalog" | "tables" | "functions" | "search";
  tables?: Array<{ schema: string; name: string }>;
  schema?: string;
  keyword?: string;
}

interface SqlExecuteResponse {
  status: "ok" | "error";
  message?: string;
  errorCode?: string;
  errorPosition?: number;
  errorQuery?: string;
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
      let metadataInput: ReturnType<typeof metadataRpcInput>;
      try {
        metadataInput = metadataRpcInput(body);
      } catch (cause) {
        return json({ status: "error", message: cause instanceof Error ? cause.message : "数据库结构参数无效" } satisfies SqlExecuteResponse, 400);
      }
      const { data, error } = metadataInput
        ? await userClient.rpc("get_sql_console_metadata_scoped", metadataInput)
        : await userClient.rpc("get_sql_console_metadata");
      if (error) {
        if (error.code === "22023") return json({ status: "error", message: "数据库对象范围过大或参数无效，请缩小范围后重试" } satisfies SqlExecuteResponse, 400);
        return json({ status: "error", message: "数据库结构加载失败，请稍后重试" } satisfies SqlExecuteResponse, 500);
      }
      return json(data);
    }

    const requestId = body?.requestId;
    if (requestId !== undefined && (typeof requestId !== "string" || !/^[a-f\d]{8}-[a-f\d]{4}-[1-8][a-f\d]{3}-[89ab][a-f\d]{3}-[a-f\d]{12}$/i.test(requestId))) {
      return json({ status: "error", message: "查询请求编号无效" } satisfies SqlExecuteResponse, 400);
    }
    if (body?.action === "cancel") {
      if (!isSuper || !requestId) return json({ status: "error", message: "当前账号无权取消此查询" } satisfies SqlExecuteResponse, 403);
      const { data, error } = await userClient.rpc("sql_console_request_control", { p_action: "cancel", p_request_id: requestId });
      if (error || !isRecord(data) || typeof data.state !== "string") return json({ status: "error", message: "取消请求未能送达，请重试" } satisfies SqlExecuteResponse, 503);
      return json({ status: "ok", state: data.state });
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
    const prefix = body.action === "explain" ? explainPrefix : canWrap ? selectPrefix : returningMutation ? mutationPrefix : "";
    const suffix = body.action === "explain" ? "" : canWrap
      ? `\n) AS _sql_console_result LIMIT ${maxRows + 1}`
      : returningMutation
        ? `\n)
                SELECT
                  (SELECT count(*) FROM _sql_console_mutation) AS affected_rows,
                  (SELECT coalesce(jsonb_agg(to_jsonb(_shown)), '[]'::jsonb)
                     FROM (SELECT * FROM _sql_console_mutation LIMIT ${maxRows + 1}) AS _shown) AS displayed_rows`
        : "";
    const executedQuery = prefix + queryText + suffix;

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
    const leaseId = requestId ? crypto.randomUUID() : undefined;
    const control = async (action: "begin" | "status" | "finish", finalState?: string): Promise<string> => {
      const { data, error } = await userClient.rpc("sql_console_request_control", {
        p_action: action, p_request_id: requestId, p_lease_id: leaseId,
        ...(finalState ? { p_final_state: finalState } : {}),
      });
      if (error || !isRecord(data) || typeof data.state !== "string") throw new Error("查询状态服务暂不可用，请稍后重试");
      return data.state;
    };
    // The owning transaction is kept open until the cancel dispatch is acknowledged.
    // No browser/RPC accepts a PID, and no future transaction shares this client.
    const cancelDb = requestId ? postgres(connectionString, { prepare: false, max: 1, connect_timeout: 5 }) : undefined;
    let backend: { pid: number; backendStart: string; transactionStart: string } | undefined;
    const applicationName = requestId ? `art-sql-console:${requestId}` : "art-sql-console";
    const cancellation = requestId ? createQueryCancellation(() => control("status"), async () => {
      if (!backend || !cancelDb) return;
      await cancelDb`SELECT pg_catalog.pg_cancel_backend(pid) FROM pg_catalog.pg_stat_activity
        WHERE pid = ${backend.pid} AND backend_start = ${backend.backendStart}::text::timestamptz
          AND xact_start = ${backend.transactionStart}::text::timestamptz`;
    }) : undefined;
    let registered = false;
    let finalState = "failed";
    let userQueryFailure: { error: unknown; location: SqlErrorLocation | undefined } | undefined;
    try {
      if (requestId) {
        const state = await control("begin");
        if (state === "conflict") return json({ status: "error", message: "此查询请求已执行，请重新运行生成新请求" } satisfies SqlExecuteResponse, 409);
        if (state !== "running" && state !== "cancel_requested") throw new Error("查询请求范围已改变，请重新执行");
        registered = true;
        if (state === "cancel_requested") throw new SqlQueryCancelledError();
      }
      const result = await db.begin(async (tx) => {
        const run = <T>(query: () => CancellableSqlQuery<T>): PromiseLike<T> => cancellation ? cancellation.run(query) : query();
        await tx`SELECT set_config('statement_timeout', ${String(timeoutMs)}, true)`;
        if (requestId) {
          await tx`SELECT set_config('application_name', ${applicationName}, true)`;
          const identity = await tx`SELECT pid, backend_start::text AS backend_start, xact_start::text AS transaction_start
            FROM pg_catalog.pg_stat_activity WHERE pid = pg_backend_pid()`;
          const row = identity[0];
          if (!row || typeof row.pid !== "number" || typeof row.backend_start !== "string" || typeof row.transaction_start !== "string") throw new Error("无法识别查询会话，请重试");
          backend = { pid: row.pid, backendStart: row.backend_start, transactionStart: row.transaction_start };
        }
        if (canWrap) await tx`SELECT set_config('transaction_read_only', 'on', true)`;
        // Capture only the actual user statement. Session setup, metadata,
        // transaction completion, and cancellation control use different SQL.
        const executeUserQuery = () => run(async () => {
          try {
            return await tx.unsafe(executedQuery);
          } catch (error) {
            userQueryFailure = {
              error,
              location: mapSqlErrorPosition(error, { rawQuery, queryText, executedQuery, prefix, suffix }),
            };
            throw error;
          }
        });
        if (body.action === "explain") {
          const explained = await executeUserQuery();
          const plan: unknown = explained[0]?.["QUERY PLAN"] ?? null;
          return { mode: "explain" as const, plan };
        }

        const executed = await executeUserQuery();
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
          ? await run(() => tx.unsafe(`SELECT oid::int AS oid, pg_catalog.format_type(oid, NULL) AS full_type
              FROM pg_catalog.pg_type WHERE oid IN (${[...new Set(oidList)].join(",")})`))
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

      finalState = "finished";

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
      if (error instanceof SqlQueryCancelledError) finalState = "cancelled";
      const durationMs = Date.now() - startTime;
      const pgMessage = error instanceof Error ? error.message : "SQL execution failed";
      const location = userQueryFailure && userQueryFailure.error === error && !(error instanceof SqlQueryCancelledError) && !pgMessage.includes("statement timeout")
        ? userQueryFailure.location
        : undefined;
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
        message: error instanceof SqlQueryCancelledError ? "查询已取消" : pgMessage.includes("statement timeout") ? "SQL 执行超时，请缩小查询范围后重试" : formatErrorMessage(pgMessage),
        ...(error instanceof SqlQueryCancelledError ? { errorCode: "SQL_QUERY_CANCELLED" } : {}),
        ...location,
        duration_ms: durationMs,
        query_text: queryText,
        executionScope: "database",
      } satisfies SqlExecuteResponse, 500);
    } finally {
      await cancellation?.stop();
      const closed = await Promise.allSettled([db.end(), cancelDb?.end()]);
      for (const outcome of closed) if (outcome.status === "rejected") console.error("Failed to close SQL console database connection:", outcome.reason);
      if (registered) {
        try { await control("finish", finalState); }
        catch (stateError) { console.error("Failed to finish SQL cancellation registry:", stateError); }
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

