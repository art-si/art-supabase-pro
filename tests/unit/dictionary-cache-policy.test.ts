import assert from 'node:assert/strict'
import test from 'node:test'
import {
  DICTIONARY_CACHE_TTL_MS,
  isDictionaryCacheFresh
} from '../../src/store/modules/dictionary-cache-policy'

const now = 1_000_000

test('empty per-code results remain fresh until the dictionary TTL expires', () => {
  assert.equal(isDictionaryCacheFresh(now, 0, now + DICTIONARY_CACHE_TTL_MS - 1), true)
  assert.equal(isDictionaryCacheFresh(now, 0, now + DICTIONARY_CACHE_TTL_MS), false)
})

test('a completed full list covers codes with no rows', () => {
  assert.equal(isDictionaryCacheFresh(undefined, now, now + 1), true)
  assert.equal(isDictionaryCacheFresh(now - DICTIONARY_CACHE_TTL_MS, now, now + 1), true)
})

test('missing or future-dated cache timestamps require a new request', () => {
  assert.equal(isDictionaryCacheFresh(undefined, 0, now), false)
  assert.equal(isDictionaryCacheFresh(now + 1, 0, now), false)
})
