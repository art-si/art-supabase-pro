import assert from 'node:assert/strict'
import test from 'node:test'
import { parseLocalDriverDocumentOcr } from '../../modules/art-supabase-tms/src/api/modules/driver-document-ocr-parser'

test('local OCR extracts only visible synthetic identity fields despite Chinese spacing', () => {
  const result = parseLocalDriverDocumentOcr(
    '姓名 : 测试 司机 甲\n性 别 : 男 民族 : 汉\n出 生日 期 : 1990-01-01\n身份 证 号 : 110101199001010011\n住址 : 北京 市 东城 区 测试 路 18 号',
    'idCardFrontUrl',
    0.91
  )
  assert.equal(result.document.driverName, '测试司机甲')
  assert.equal(result.document.idCardNo, '110101199001010011')
  assert.equal(result.document.gender, '男')
  assert.equal(result.document.ethnicity, '汉')
  assert.equal(result.document.birthDate, '1990-01-01')
  assert.equal(result.document.idCardValidTo, null)
  assert.match(result.summary, /本地离线识别/)
})

test('license and qualification fields stay within their own document type', () => {
  const license = parseLocalDriverDocumentOcr(
    '档案编号:JS12345\n准驾车型:A2,B2\n有效期限:2022年01月01日 至 2028年01月01日',
    'driverLicenseFrontUrl',
    0.85
  )
  assert.equal(license.document.licenseArchiveNo, 'JS12345')
  assert.deepEqual(license.document.licenseClasses, ['A2', 'B2'])
  assert.equal(license.document.licenseValidFrom, '2022-01-01')
  assert.equal(license.document.licenseExpireDate, '2028-01-01')
  assert.equal(license.document.idCardNo, undefined)

  const qualification = parseLocalDriverDocumentOcr(
    '从业资格证类型:经营性道路货物运输驾驶员\n资格证号:ABC123\n有效期:2029-05-08',
    'qualificationFrontUrl',
    0.82
  )
  assert.equal(qualification.document.qualificationType, '经营性道路货物运输驾驶员')
  assert.equal(qualification.document.qualificationNo, 'ABC123')
  assert.equal(qualification.document.qualificationValidTo, '2029-05-08')
  assert.equal(qualification.document.licenseArchiveNo, undefined)
})
