const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const { DatabaseSync } = require('node:sqlite');

function harness(fenced = false) {
  const sqlDatabase = new DatabaseSync(':memory:');
  sqlDatabase.exec('CREATE TABLE queue (id TEXT PRIMARY KEY,shiftId TEXT NOT NULL,lat REAL NOT NULL,lng REAL NOT NULL,accuracy REAL NOT NULL,captured INTEGER NOT NULL,battery INTEGER)');
  const values = new Map();
  const inserted = [];
  const requests = [];
  const stops = [];
  let blockNetwork = false, stopped = false;
  let resolveGps, rejectGps;
  const gps = new Promise((resolve, reject) => { resolveGps = resolve; rejectGps = reject; });
  const database = {
    getFirstAsync: async (sql) => sql.includes('FROM settings')
      ? { value: JSON.stringify(values.get('active') ?? null) } : null,
    getAllAsync: async () => stops,
    runAsync: async (sql, ...args) => {
      if (sql.includes('INTO queue')) {
        sqlDatabase.prepare(sql).run(...args);
        inserted.push(args);
      }
      if (sql.includes('INTO settings')) values.set(args[0], JSON.parse(args[1]));
      if (sql.includes('INTO pending_stops')) stops.push({ shiftId: args[0], ended: args[1] });
    },
    withExclusiveTransactionAsync: async (fn) => fn(database),
  };
  const mocks = {
    'expo-task-manager': { defineTask() {} },
    'expo-location': {
      Accuracy: { Balanced: 3, High: 4 },
      requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
      requestBackgroundPermissionsAsync: async () => ({ status: 'granted' }),
      startLocationUpdatesAsync: async (_name, options) => {
        assert.equal(options.accuracy, 4, 'request GPS accuracy during work');
        assert.equal(options.distanceInterval, 0, 'stationary employees still send updates');
      },
      getCurrentPositionAsync: (options) => {
        assert.equal(options.accuracy, 4);
        return gps;
      },
      hasStartedLocationUpdatesAsync: async () => true,
      stopLocationUpdatesAsync: async () => { stopped = true; },
    },
    'expo-battery': { getBatteryLevelAsync: async () => 0.8 },
    'expo-crypto': { randomUUID: () => 'test-id' },
    'react-native': { Platform: { OS: 'android' } },
    './store': {
      active: async () => values.get('active'),
      credentials: async () => ({ url: 'https://test.invalid', token: 'test-key' }),
      db: async () => database,
      getValue: async (key) => values.get(key) ?? null,
      setValue: async (key, value) => { values.set(key, value); },
    },
  };
  const compiled = ts.transpileModule(readFileSync(resolve(__dirname, '../src/tracking.ts'), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const exports = {};
  vm.runInNewContext(compiled, {
    exports, require: (id) => { assert.ok(mocks[id], id); return mocks[id]; },
    AbortController, setTimeout: (...args) => setTimeout(...args).unref(), clearTimeout,
    fetch: (_url, options) => { requests.push(options.body ? JSON.parse(options.body) : null); return blockNetwork ? new Promise(() => {}) : Promise.resolve({ ok: true, json: async () => options.body ? {shift:{id:'shift-one',started:1}} : {sites:fenced?[{id:'site'}]:[],shift:null} }); },
  });
  return { exports, values, inserted, requests, resolveGps, rejectGps, stops,
    blockNetwork: () => { blockNetwork = true; }, stopped: () => stopped };
}
const settle = () => new Promise((resolve) => setImmediate(resolve));
test('site attendance waits for a fresh GPS fix before sending clock-in', async () => {
  const h = harness(true);
  const starting = h.exports.startShift();
  await settle();
  assert.ok(!h.requests.some(r => r?.action === 'start'));
  h.resolveGps({ timestamp: Date.now(), mocked: false, coords: { latitude: 12, longitude: 77, accuracy: 10 } });
  await starting;
  const request = h.requests.find(r => r?.action === 'start');
  assert.equal(request.location.lat, 12);
  assert.equal(request.location.accuracy, 10);
});

test('starting a shift completes while the first GPS fix is still pending', { timeout: 2000 }, async () => {
  const h = harness();
  const shift = await h.exports.startShift();
  assert.equal(shift.shiftId, 'shift-one');
  assert.equal(h.values.get('active').shiftId, 'shift-one');
  assert.equal(h.inserted.length, 0);
  h.resolveGps({ timestamp: Date.now(), coords: { latitude: 12, longitude: 77, accuracy: 10 } });
  await settle();
  assert.equal(h.inserted.length, 1);
});

test('a delayed GPS fix cannot be attributed to a different shift', async () => {
  const h = harness();
  await h.exports.startShift();
  h.values.set('active', { shiftId: 'shift-two', started: 1 });
  h.resolveGps({ timestamp: Date.now(), coords: { latitude: 12, longitude: 77, accuracy: 10 } });
  await settle();
  assert.equal(h.inserted.length, 0);
});

test('GPS failure is recorded without undoing the running shift', async () => {
  const h = harness();
  await h.exports.startShift();
  h.rejectGps(new Error('GPS unavailable'));
  await settle();
  assert.equal(h.values.get('active').shiftId, 'shift-one');
  assert.equal(h.values.get('syncError'), 'GPS unavailable');
});

test('finish work stops local collection without waiting for an offline server', { timeout: 2000 }, async () => {
  const h = harness();
  h.values.set('active', { shiftId: 'shift-one', started: 1 });
  h.blockNetwork();
  await h.exports.endShift();
  assert.equal(h.values.get('active'), null);
  assert.equal(h.stopped(), true);
  assert.equal(h.stops[0].shiftId, 'shift-one');
});
