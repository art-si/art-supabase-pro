export interface ContractSigningParty {
  label?: string
  name: string
  representative?: string | null
  signatureUrl?: string | null
  sealUrl?: string | null
  signedOn?: string | null
}

export interface ContractDocument {
  title: string
  documentNo: string
  startsOn: string | null
  endsOn: string | null
  partyA: ContractSigningParty
  partyB: ContractSigningParty
  facts?: { label: string; value: string }[]
  contentHtml: string
  attachments: string[]
  certificateGroups?: { label: string; urls: string[] }[]
  settlementText?: string
}

export interface ContractDocumentPreviewExpose {
  handleOpen: (document: ContractDocument) => Promise<void>
}
