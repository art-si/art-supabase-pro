import assert from 'node:assert/strict'
import test from 'node:test'
import { normalizeAmapCoordinate, readAmapDrivingPath } from '../../src/utils/amap'

test('SDK coordinate normalization accepts documented objects, instances and tuples without rounding', () => {
  class LngLat {
    getLng() {
      return 120.123456789
    }
    getLat() {
      return 30.123456789
    }
  }
  const expected = { longitude: 120.123456789, latitude: 30.123456789 }
  assert.deepEqual(normalizeAmapCoordinate(new LngLat()), expected)
  assert.deepEqual(
    normalizeAmapCoordinate({ lng: expected.longitude, lat: expected.latitude }),
    expected
  )
  assert.deepEqual(normalizeAmapCoordinate([expected.longitude, expected.latitude]), expected)
  assert.deepEqual(normalizeAmapCoordinate({ lng: 0, lat: 0 }), { longitude: 0, latitude: 0 })
})

test('missing, invalid and throwing SDK coordinates are rejected without escaping the callback', () => {
  for (const point of [
    null,
    undefined,
    '',
    [],
    [120],
    { lng: '', lat: 30 },
    { lng: 181, lat: 30 },
    { lng: 120, lat: Infinity },
    {
      getLng() {
        throw new Error('SDK failure')
      },
      lat: 30
    },
    {
      get lng() {
        throw new Error('SDK failure')
      },
      lat: 30
    }
  ]) {
    assert.equal(normalizeAmapCoordinate(point), null)
  }
})

test('driving geometry retains ordered steps, repeated return visits and the selected first route', () => {
  const path = readAmapDrivingPath({
    routes: [
      {
        steps: [
          {
            path: [
              { lng: 120, lat: 30 },
              { getLng: () => 121, getLat: () => 31 }
            ]
          },
          {
            path: [
              [122, 32],
              [121, 31],
              [120, 30]
            ]
          }
        ]
      },
      {
        steps: [
          {
            path: [
              [1, 1],
              [2, 2]
            ]
          }
        ]
      }
    ]
  })
  assert.deepEqual(path, [
    [120, 30],
    [121, 31],
    [122, 32],
    [121, 31],
    [120, 30]
  ])
})

test('missing or stationary road geometry never becomes a successful endpoint-only line', () => {
  for (const result of [
    null,
    {
      get routes() {
        throw new Error('SDK failure')
      }
    },
    {},
    { routes: [] },
    { routes: [{}] },
    { routes: [{ steps: [] }] },
    {
      routes: [
        {
          steps: [
            {
              path: [
                [120, 30],
                [120, 30]
              ]
            }
          ]
        }
      ]
    }
  ]) {
    assert.deepEqual(readAmapDrivingPath(result), [])
  }
})

test('a malformed road segment rejects the entire path instead of connecting across the gap', () => {
  for (const step of [
    null,
    {
      get path() {
        throw new Error('SDK failure')
      }
    },
    {},
    { path: 'encoded-but-undocumented' },
    {
      path: [
        [120, 30],
        [181, 30],
        [121, 31]
      ]
    },
    {
      path: [
        [120, 30],
        {
          getLng() {
            throw new Error('SDK failure')
          },
          lat: 30
        },
        [121, 31]
      ]
    }
  ]) {
    assert.deepEqual(
      readAmapDrivingPath({
        routes: [
          {
            steps: [
              {
                path: [
                  [119, 29],
                  [120, 30]
                ]
              },
              step
            ]
          }
        ]
      }),
      []
    )
  }
})
