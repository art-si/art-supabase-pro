import type { CompilerOptions } from 'typescript'

export function createModuleTypecheckConfig(
  applicationRoot: string,
  platformRoot: string,
  compilerOptions: CompilerOptions
): { extends: string; compilerOptions: Pick<CompilerOptions, 'baseUrl' | 'paths'> }

export function typecheckModule(options: { applicationRoot: string; platformRoot: string }): number
