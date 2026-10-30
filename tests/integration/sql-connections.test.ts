import assert from 'node:assert/strict'
import { test } from 'node:test'
import postgres from 'postgres'
import mysql from 'mysql2/promise'
import {
  inspectSqlConnection,
  querySqlConnection,
  withSqlDatabase
} from '../../scripts/sql-gateway-driver'
import type { SqlConnection } from '../../src/types/sql-connections'

// These tests use dedicated disposable containers only; never point them at a business database.
const enabled = process.env.SQL_GATEWAY_REAL_DATABASES === '1'
const password = 'sql_console_test_only'
const base: SqlConnection = {
  id: 'test',
  name: '隔离测试',
  dialect: 'postgres',
  host: '127.0.0.1',
  port: 18543,
  database: 'console_test',
  username: 'postgres',
  tls: false,
  enabled: true,
  tenantId: 'test',
  allowedUserIds: [],
  updatedAt: 'test'
}
for (const dialect of ['postgres', 'mysql'] as const)
  test(
    `${dialect}: real connection, metadata, row cap, JSON, plan, read-only transaction and timeout`,
    { skip: !enabled, timeout: 120000 },
    async () => {
      const connection = {
        ...base,
        dialect,
        port: dialect === 'postgres' ? 18543 : 18306,
        username: dialect === 'postgres' ? 'postgres' : 'root'
      }
      if (dialect === 'postgres') {
        const db = postgres({
          host: connection.host,
          port: connection.port,
          database: connection.database,
          username: connection.username,
          password,
          connect_timeout: 5
        })
        try {
          await db`CREATE TABLE IF NOT EXISTS sql_workbench_test (id integer PRIMARY KEY, payload jsonb, label text)`
          await db`INSERT INTO sql_workbench_test SELECT id, jsonb_build_object('id',id,'tags',jsonb_build_array('测试','json')), 'label-' || id FROM generate_series(1,100) id ON CONFLICT DO NOTHING`
          await db`COMMENT ON TABLE sql_workbench_test IS '隔离测试表'`
          await db`COMMENT ON COLUMN sql_workbench_test.label IS '显示名称'`
          await db`CREATE INDEX IF NOT EXISTS sql_workbench_test_label ON sql_workbench_test(label)`
          await db`CREATE OR REPLACE VIEW sql_workbench_test_view AS SELECT id,label FROM sql_workbench_test`
          await db`CREATE TABLE IF NOT EXISTS sql_workbench_child (id integer PRIMARY KEY, parent_id integer REFERENCES sql_workbench_test(id))`
          await db`CREATE MATERIALIZED VIEW IF NOT EXISTS sql_workbench_test_materialized AS SELECT id,label FROM sql_workbench_test`
        } finally {
          await db.end({ timeout: 0 })
        }
      } else {
        const db = await mysql.createConnection({
          host: connection.host,
          port: connection.port,
          database: connection.database,
          user: connection.username,
          password,
          connectTimeout: 5000
        })
        try {
          await db.query(
            "CREATE TABLE IF NOT EXISTS sql_workbench_test (id integer PRIMARY KEY, payload json, label varchar(80) COMMENT '显示名称', INDEX sql_workbench_test_label(label)) COMMENT='隔离测试表'"
          )
          await db.query('INSERT IGNORE INTO sql_workbench_test (id,payload,label) VALUES ?', [
            Array.from({ length: 100 }, (_, index) => [
              index + 1,
              JSON.stringify({ id: index + 1, tags: ['测试', 'json'] }),
              `label-${index + 1}`
            ])
          ])
          await db.query(
            'CREATE OR REPLACE VIEW sql_workbench_test_view AS SELECT id,label FROM sql_workbench_test'
          )
          await db.query(
            'CREATE TABLE IF NOT EXISTS sql_workbench_child (id integer PRIMARY KEY, parent_id integer, FOREIGN KEY(parent_id) REFERENCES sql_workbench_test(id))'
          )
        } finally {
          db.destroy()
        }
      }
      const schemas = await inspectSqlConnection(connection, password)
      const schema = dialect === 'postgres' ? 'public' : 'console_test'
      assert.ok(schemas.schemas.includes(schema))
      assert.equal(schemas.tables.length, 0)
      const metadata = await inspectSqlConnection(connection, password, schema)
      const table = metadata.tables.find((table) => table.tableName === 'sql_workbench_test')
      assert.equal(table?.columns.length, 3)
      assert.equal(table?.description, '隔离测试表')
      assert.equal(
        table?.columns.find((column) => column.name === 'label')?.description,
        '显示名称'
      )
      assert.equal(table?.columns.find((column) => column.name === 'id')?.isPrimaryKey, true)
      assert.ok(
        metadata.foreignKeys.some(
          (key) =>
            key.sourceTable === 'sql_workbench_child' &&
            key.sourceColumn === 'parent_id' &&
            key.targetTable === 'sql_workbench_test' &&
            key.targetColumn === 'id'
        )
      )
      if (dialect === 'postgres')
        assert.equal(
          metadata.tables.find((table) => table.tableName === 'sql_workbench_test_materialized')
            ?.columns.length,
          2
        )
      assert.ok(table?.indexes?.some((index) => index.name === 'sql_workbench_test_label'))
      assert.ok(
        metadata.tables.some(
          (table) => table.tableName === 'sql_workbench_test_view' && table.kind === 'view'
        )
      )
      const query = {
        query: 'SELECT id,payload,label FROM sql_workbench_test ORDER BY id',
        action: 'execute' as const,
        maxRows: 10,
        timeoutMs: 10000
      }
      const result = await querySqlConnection(connection, password, query)
      assert.equal(result.rows.length, 10)
      assert.equal(result.truncated, true)
      assert.deepEqual(
        result.columns.map((column) => column.name),
        ['id', 'payload', 'label']
      )
      assert.equal(typeof result.rows[0].payload, 'object')
      const plan = await querySqlConnection(connection, password, { ...query, action: 'explain' })
      assert.equal(plan.rows.length, 1)
      assert.ok(plan.rows[0][dialect === 'postgres' ? 'QUERY PLAN' : 'EXPLAIN'])
      await assert.rejects(
        withSqlDatabase(connection, password, 5000, (run) => run('DELETE FROM sql_workbench_test')),
        /read.only|read only|READ ONLY|read-only/i
      )
      const started = Date.now()
      await assert.rejects(
        querySqlConnection(connection, password, {
          ...query,
          timeoutMs: 1000,
          query: dialect === 'postgres' ? 'SELECT pg_sleep(10)' : 'SELECT SLEEP(10)'
        })
      )
      assert.ok(Date.now() - started < 7000)
    }
  )
