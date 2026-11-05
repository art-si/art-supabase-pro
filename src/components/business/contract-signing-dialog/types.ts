export interface ContractSigningInput {
  partyASignatureUrl: string
  partyASealUrl: string
  partyBSignatureUrl: string
  partyBSealUrl: string
}

export interface ContractSigningOpenData {
  title: string
  documentNo: string
  tenantId: string
  partyAName: string
  partyBName: string
  onSubmit: (input: ContractSigningInput) => Promise<void>
}

export interface ContractSigningDialogExpose {
  handleOpen: (data: ContractSigningOpenData) => Promise<void>
}
