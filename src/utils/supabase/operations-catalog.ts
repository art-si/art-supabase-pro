import type {
  OperationField,
  SupabaseOperation,
  OperationRun
} from '../../types/supabase-operations'
import { isBackupVerificationReport } from './operations-verification'
import { isBackupUpdateReport } from './operations-update'

export const OPERATIONS_PROJECT_REF = 'ckbftoopuyophiebamwy'
const backupPath: OperationField = {
  key: 'BackupPath',
  label: '备份目录',
  required: true,
  placeholder: 'D:\\备份\\20261029-090000',
  help: '选择包含 manifest.json 的完整备份目录。'
}
const localRoot: OperationField = {
  key: 'LocalRoot',
  label: '本地 Supabase 目录',
  required: true,
  placeholder: 'D:\\supabase-local',
  help: '首次恢复需使用全新目录；续跑需使用原目录。'
}
const archivePath: OperationField = {
  key: 'ArchivePath',
  label: 'ZIP 文件路径',
  required: true,
  placeholder: 'D:\\备份\\art-supabase-local.zip'
}
export const SUPABASE_OPERATIONS: SupabaseOperation[] = [
  {
    id: 'diagnose',
    title: '环境与连接检查',
    description: '检查 CLI、Docker 和来源项目登录，提前发现缺失依赖。',
    script: 'operations-task.ps1',
    permission: 'SupabaseOperations:Diagnose',
    risk: 'read',
    fields: [],
    stages: ['检查运行环境', '检查 Docker', '检查来源项目登录']
  },
  {
    id: 'syncFunctions',
    title: '同步远端函数源码',
    description: '逐个下载已部署函数到独立快照目录，显示当前函数和完成数量。',
    script: 'sync-supabase-functions.ps1',
    permission: 'SupabaseOperations:SyncFunctions',
    risk: 'read',
    fields: [],
    stages: ['检查来源项目登录', '读取函数清单', '逐个下载函数', '校验源码快照']
  },
  {
    id: 'backup',
    title: '创建完整备份',
    description: '导出数据库、函数、Storage 和元数据，生成可校验清单。',
    script: 'backup-supabase.ps1',
    permission: 'SupabaseOperations:Backup',
    risk: 'read',
    fields: [
      { key: 'DbPassword', label: '来源数据库密码', kind: 'secret', required: true },
      {
        key: 'BackupRoot',
        label: '备份根目录（可选）',
        help: '默认保存在仓库的 supabase/backups 中。'
      }
    ],
    stages: [
      '检查来源项目登录',
      '关联来源项目',
      '导出数据库',
      '下载函数源码',
      '下载 Storage',
      '生成备份清单'
    ]
  },
  {
    id: 'resumeBackup',
    title: '继续未完成的备份',
    description: '复用已校验的完整 SQL，重做未完成的导出并重新下载函数与 Storage。',
    script: 'backup-supabase.ps1',
    permission: 'SupabaseOperations:ResumeBackup',
    risk: 'read',
    fields: [
      {
        ...backupPath,
        key: 'ResumeBackupPath',
        help: '填写上次备份的实际目录。完整 SQL 经校验后跳过；缺失或不完整的 SQL 会重新导出，不按字节续传。'
      },
      {
        key: 'DbPassword',
        label: '来源数据库密码',
        kind: 'secret',
        help: '数据库阶段未完成时必填，用于重新导出缺失或不完整的 SQL；数据库文件已齐全时可留空。'
      }
    ],
    stages: ['校验已有导出', '补全数据库导出', '逐个下载函数', '下载 Storage', '生成备份清单']
  },
  {
    id: 'verify',
    title: '校验备份完整性',
    description: '核对文件哈希、SQL、函数和 Storage，生成逐项校验报告；不启动恢复。',
    script: 'restore-local-supabase.ps1',
    permission: 'SupabaseOperations:Verify',
    risk: 'read',
    fields: [backupPath],
    stages: ['校验文件与清单']
  },
  {
    id: 'previewBackupUpdate',
    title: '检查远端变化',
    description: '比较现有完整备份与来源，列出变化和跳过项；只检查，不替换备份。',
    script: 'backup-supabase.ps1',
    permission: 'SupabaseOperations:PreviewUpdate',
    risk: 'read',
    fields: [
      { ...backupPath, key: 'UpdateBackupPath', label: '要更新的完整备份目录' },
      {
        key: 'DbPassword',
        label: '来源数据库密码',
        kind: 'secret',
        required: true,
        help: '用于只读比较。密码不进入更新计划或任务历史。'
      }
    ],
    stages: ['校验原备份', '比较结构和表数据', '比较函数与附件', '生成更新计划']
  },
  {
    id: 'updateBackup',
    title: '更新已有备份',
    description: '同一目录保留最新完整快照，只下载变化内容；先暂存校验，再归档并替换。',
    script: 'backup-supabase.ps1',
    permission: 'SupabaseOperations:UpdateBackup',
    risk: 'local',
    fields: [
      { ...backupPath, key: 'UpdateBackupPath', label: '要更新的完整备份目录' },
      { key: 'DbPassword', label: '来源数据库密码', kind: 'secret', required: true },
      {
        key: 'PlanId',
        label: '更新计划编号（可选）',
        help: '从检查结果准备更新时自动填写；留空会重新检查后更新。'
      }
    ],
    stages: ['核对更新计划', '只下载变化内容', '校验暂存快照', '归档旧文件并提交']
  },
  {
    id: 'package',
    title: '制作分发包',
    description: '校验备份并生成 ZIP；分享包会移除来源 Auth 凭据，业务数据仍需审核。',
    script: 'package-supabase-backup.ps1',
    permission: 'SupabaseOperations:Package',
    risk: 'local',
    fields: [
      backupPath,
      { ...archivePath, required: false },
      {
        key: 'CliRuntimePath',
        label: '随包 CLI 目录（可选）',
        help: '可包含已安装的官方 Windows CLI，供接收者离线使用。'
      },
      { key: 'SplitForGit', label: '同时生成 Git 分片', kind: 'switch' }
    ],
    stages: ['校验备份', '生成分享包', '计算校验值']
  },
  {
    id: 'download',
    title: '下载与解压分发包',
    description: '校验 SHA-256 后解压到新目录；下载地址仅用于本次任务。',
    script: 'download-supabase-backup.ps1',
    permission: 'SupabaseOperations:Download',
    risk: 'local',
    fields: [
      { key: 'SignedUrl', label: 'HTTPS 下载地址（三选一）', kind: 'secret' },
      { ...archivePath, label: '本机 ZIP（三选一）', required: false },
      {
        key: 'PartsManifestPath',
        label: '分片清单（三选一）',
        help: '填写 ZIP.parts.json 的本机路径。'
      },
      {
        key: 'ExpectedSha256',
        label: 'SHA-256 校验值',
        help: 'HTTPS 或本机 ZIP 必填；分片清单自带校验值。'
      },
      { key: 'Destination', label: '解压到新目录', required: true }
    ],
    stages: ['下载分发包', '校验 SHA-256', '解压与清单校验']
  },
  {
    id: 'restoreLocal',
    title: '恢复到本地环境',
    description: '从已校验备份创建独立 Docker 环境，首次启动可能需要下载镜像。',
    script: 'restore-local-supabase.ps1',
    permission: 'SupabaseOperations:RestoreLocal',
    risk: 'local',
    fields: [backupPath, localRoot],
    stages: ['校验备份', '启动本地 Supabase', '恢复数据库', '恢复 Storage', '验证本地环境']
  },
  {
    id: 'resumeLocal',
    title: '继续本地恢复',
    description: '复用原本地目录和备份标记，继续之前中断的恢复。',
    script: 'restore-local-supabase.ps1',
    permission: 'SupabaseOperations:ResumeLocal',
    risk: 'local',
    fields: [backupPath, localRoot],
    stages: ['校验备份', '启动本地 Supabase', '恢复数据库', '恢复 Storage', '验证本地环境']
  },
  {
    id: 'restoreRemote',
    title: '恢复到新云项目',
    description: '仅允许恢复到另一个全新、空白的 Supabase 项目，执行前再次核对目标。',
    script: 'restore-supabase.ps1',
    permission: 'SupabaseOperations:RestoreRemote',
    risk: 'remote',
    fields: [
      backupPath,
      { key: 'TargetProjectRef', label: '目标项目 ID', required: true },
      { key: 'TargetDbPassword', label: '目标数据库密码', required: true, kind: 'secret' },
      { key: 'ConfirmTargetProjectRef', label: '再次输入目标项目 ID', required: true }
    ],
    stages: ['校验备份', '检查空白目标', '恢复数据库', '恢复 Storage 与函数', '验证恢复结果']
  },
  {
    id: 'publish',
    title: '发布短期下载链接',
    description: '将分发 ZIP 上传到单独的分发项目，原项目不可作为分发目标。',
    script: 'publish-supabase-backup.ps1',
    permission: 'SupabaseOperations:Publish',
    risk: 'remote',
    fields: [
      archivePath,
      { key: 'DistributionProjectRef', label: '独立分发项目 ID', required: true },
      {
        key: 'DistributionSecretKey',
        label: '分发项目 Secret Key',
        kind: 'secret',
        required: true
      },
      { key: 'BucketId', label: '私有分发桶（可选）', placeholder: 'project-transfer-backups' },
      {
        key: 'ExpiresInSeconds',
        label: '链接有效秒数（可选）',
        placeholder: '3600',
        help: '60 至 86400 秒。'
      }
    ],
    stages: ['校验分发包', '上传分发项目', '生成短期下载链接']
  },
  {
    id: 'setLocalLogin',
    title: '设置本地登录密码',
    description: '只修改恢复后的本地 Auth 账号；不修改来源云项目用户。',
    script: 'set-local-login.ps1',
    permission: 'SupabaseOperations:SetLocalLogin',
    risk: 'local',
    fields: [
      localRoot,
      { key: 'Email', label: '已恢复账号的邮箱', required: true },
      { key: 'Password', label: '新的本地密码', kind: 'secret', required: true }
    ],
    stages: ['检查本地环境', '查找本地账号', '设置本地密码']
  }
]
export function findSupabaseOperation(id: unknown): SupabaseOperation | undefined {
  return SUPABASE_OPERATIONS.find((operation) => operation.id === id)
}
export function operationNeedsInspectionAfterCancel(operation: SupabaseOperation): boolean {
  return (
    operation.risk === 'remote' ||
    ['backup', 'resumeBackup', 'updateBackup', 'restoreLocal', 'resumeLocal'].includes(operation.id)
  )
}
export const OPERATION_STATUS_LABELS = {
  running: '执行中',
  cancelling: '正在取消',
  succeeded: '已完成',
  failed: '失败',
  cancelled: '已取消',
  interrupted: '已中断，待核对'
} as const

export function isOperationRun(value: unknown): value is OperationRun {
  if (!value || typeof value !== 'object') return false
  const run = value as Partial<OperationRun>
  if (typeof run.status !== 'string' || !Object.hasOwn(OPERATION_STATUS_LABELS, run.status))
    return false
  return (
    typeof run.id === 'string' &&
    /^[a-f\d-]{36}$/.test(run.id) &&
    Boolean(findSupabaseOperation(run.operationId)) &&
    typeof run.startedAt === 'string' &&
    Number.isFinite(Date.parse(run.startedAt)) &&
    typeof run.lastOutputAt === 'string' &&
    Number.isFinite(Date.parse(run.lastOutputAt)) &&
    typeof run.title === 'string' &&
    typeof run.actorId === 'string' &&
    typeof run.stage === 'string' &&
    typeof run.status === 'string' &&
    run.status in OPERATION_STATUS_LABELS &&
    Boolean(run.parameters) &&
    typeof run.parameters === 'object' &&
    !Array.isArray(run.parameters) &&
    Array.isArray(run.logs) &&
    run.logs.every(
      (line) =>
        line &&
        typeof line.message === 'string' &&
        typeof line.time === 'string' &&
        typeof line.sequence === 'number' &&
        ['info', 'error'].includes(line.level)
    ) &&
    (run.verificationReport === undefined ||
      (run.operationId === 'verify' && isBackupVerificationReport(run.verificationReport))) &&
    (run.updateReport === undefined ||
      (['previewBackupUpdate', 'updateBackup'].includes(String(run.operationId)) &&
        isBackupUpdateReport(run.updateReport))) &&
    (run.artifacts === undefined ||
      (Array.isArray(run.artifacts) &&
        run.artifacts.every(
          (artifact) =>
            artifact &&
            typeof artifact.label === 'string' &&
            typeof artifact.value === 'string' &&
            ['link', 'path'].includes(artifact.kind)
        )))
  )
}
