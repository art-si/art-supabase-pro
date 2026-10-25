import { serve } from 'https://deno.land/std@0.201.0/http/server.ts';

Deno.serve(async (req: Request) => {
  try {
    const url = new URL(req.url);
    const method = req.method.toUpperCase();
    const authHeader = req.headers.get('authorization') || '';

    // 校验 Authorization 头格式
    if (!authHeader.toLowerCase().startsWith('bearer ')) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing or invalid Authorization header' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 提取用户 Token
    const token = authHeader.split(' ')[1];
    if (!token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Missing token' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 读取 Supabase 环境变量
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!SUPABASE_URL || !SERVICE_ROLE) {
      return new Response(
        JSON.stringify({ success: false, error: 'Server misconfigured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 🌟 核心修改点：删除了多余的 apikey 请求头，仅保留用户 Token 验证
    // 验证用户 Token 有效性，获取用户信息
    const verifyRes = await fetch(
      `${SUPABASE_URL.replace(/\/$/, '')}/auth/v1/user`,
      {
        method: 'GET',
        headers: { 'Authorization': `Bearer ${token}` } // 移除了 apikey: SERVICE_ROLE
      }
    );

    if (!verifyRes.ok) {
      return new Response(
        JSON.stringify({ success: false, error: 'Invalid token or unable to verify' }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      );
    }
    const user = await verifyRes.json();

    // 管理员权限校验（已兼容你配置的 user_metadata.is_admin = true）
    const isAdmin = 
      (user?.role === 'admin') || 
      (user?.app_metadata && user.app_metadata.role === 'admin') || 
      (user?.user_metadata && user.user_metadata.is_admin === true) || 
      false;
    
    if (!isAdmin) {
      return new Response(
        JSON.stringify({ success: false, error: 'Forbidden: admin role required' }),
        { status: 403, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 解析前端传入的过滤条件
    let filters: any = {};
    if (method === 'GET') {
      url.searchParams.forEach((v, k) => { filters[k] = v; });
    } else if (method === 'POST') {
      try {
        filters = await req.json();
      } catch {
        filters = {};
      }
    }

    // 提取并格式化日志查询参数
    const service = (filters.service || 'postgres');
    const limit = Math.min(Number(filters.limit || 100), 1000);
    const since = filters.since;
    const until = filters.until;
    const level = filters.level;
    const status_code = filters.status_code;
    const function_id = filters.function_id;
    const query_text = filters.query_text;
    const order = (filters.order || 'desc').toLowerCase();

    // 构造 Supabase Logs API 请求
    const logsBase = `${SUPABASE_URL.replace(/\/$/, '')}/logs/v1`;
    const params = new URLSearchParams();
    params.set('service', service);
    params.set('limit', String(limit));
    if (since) params.set('since', String(since));
    if (until) params.set('until', String(until));
    if (order) params.set('order', order);

    // 代理请求 Supabase 日志接口（此处保留 SERVICE_ROLE 授权，是正确的）
    const logsRes = await fetch(`${logsBase}?${params.toString()}`, {
      method: 'GET',
      headers: { 
        'Authorization': `Bearer ${SERVICE_ROLE}`, 
        'Content-Type': 'application/json' 
      }
    });

    if (!logsRes.ok) {
      const txt = await logsRes.text();
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch logs', detail: txt }),
        { status: 502, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // 解析日志响应数据（兼容多种返回格式）
    let payload: any;
    try {
      payload = await logsRes.json();
    } catch {
      payload = await logsRes.text();
    }

    let entries: any[] = [];
    if (Array.isArray(payload)) entries = payload;
    else if (payload && Array.isArray(payload.logs)) entries = payload.logs;
    else if (payload && payload.rows && Array.isArray(payload.rows)) entries = payload.rows;
    else if (typeof payload === 'string') entries = payload.split('\n').filter(Boolean).map((l) => ({ line: l }));

    // 二次精细过滤日志数据
    const total_before = entries.length;
    const statusCodes = (typeof status_code === 'string') 
      ? status_code.split(',').map((s: any) => s.trim()) 
      : (Array.isArray(status_code) ? status_code : null);

    const filtered = entries.filter((e: any) => {
      const text = JSON.stringify(e).toLowerCase();
      if (level && !(String(e.level || '').toLowerCase() === level.toLowerCase() || text.includes(`\"level\":\"${level.toLowerCase()}\"`))) return false;
      if (statusCodes) {
        const sc = String(e.status_code || e.status || '');
        if (!statusCodes.includes(sc)) return false;
      }
      if (function_id) {
        const fid = String(e.function_id || e.function || '');
        if (!fid.includes(String(function_id))) return false;
      }
      if (query_text) {
        if (!text.includes(String(query_text).toLowerCase())) return false;
      }
      return true;
    }).slice(0, limit);

    // 构造返回元信息和最终响应
    const meta = { 
      service, 
      limit, 
      filters_applied: Object.keys(filters), 
      total_before_filter: total_before, 
      total_after_filter: filtered.length 
    };

    return new Response(
      JSON.stringify({ success: true, data: filtered, meta }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('proxy-logs error', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});