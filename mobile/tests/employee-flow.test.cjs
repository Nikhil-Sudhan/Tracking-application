const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');
const React = require('react');
const { create, act } = require('react-test-renderer');
global.IS_REACT_ACT_ENVIRONMENT = true;

const native = Object.fromEntries(['ActivityIndicator', 'Pressable', 'RefreshControl', 'SafeAreaView', 'ScrollView', 'Text', 'TextInput', 'View'].map(name => [name, name]));
native.Platform = { OS: 'android' };
native.StatusBar = { currentHeight: 24 };
native.StyleSheet = { create: value => value };
native.Alert = { alert() {} };
native.Linking = { openSettings: async () => {} };
native.AppState = { currentState: 'active', addEventListener: () => ({ remove() {} }) };
function load(file, mocks = {}, globals = {}) {
  const exports = {};
  const code = ts.transpileModule(readFileSync(resolve(__dirname, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.React, esModuleInterop: true },
  }).outputText;
  vm.runInNewContext(code, { exports, console, URL, ...globals, require: id => {
    if (id in mocks) return mocks[id];
    if (id === 'react') return React;
    if (id === 'react-native') return native;
    if (id === 'expo-status-bar') return { StatusBar: 'StatusBar' };
    throw new Error(`Unexpected dependency ${id}`);
  }});
  return exports;
}
const { EmployeeScreens } = load('../src/EmployeeScreens.tsx');
const props = {
  ready: true, paired: true, repairMode: false, busy: false, name: 'Test Employee',
  session: null, tasks: [], pending: 0, lastSync: null, error: '', needsRecovery: false,
  url: '', deviceKey: '', setUrl() {}, setKey() {}, setRepairMode() {}, pair() {},
  start() {}, finish() {}, sync() {}, recoverFinish() {}, updateTask() {},
};
const text = tree => tree.root.findAllByType('Text').map(node => node.children.filter(c => typeof c === 'string').join('')).join(' ');

test('everyday screen exposes simple actions and keeps setup out of the way', async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(EmployeeScreens, props)); });
  assert.match(text(tree), /Start work/);
  assert.doesNotMatch(text(tree), /Company address|Setup code|API|Sync/);
  const tasksTab = tree.root.findAllByType('Pressable').find(node => node.props.accessibilityRole === 'tab' && node.findByType('Text').children[0] === 'My tasks');
  await act(async () => tasksTab.props.onPress());
  assert.match(text(tree), /You’re all clear/);
  await act(async () => tree.unmount());
});

test('first launch explains the day before showing manager connection fields', async () => {
  let tree;
  await act(async () => { tree = create(React.createElement(EmployeeScreens, { ...props, paired: false })); });
  assert.match(text(tree), /Three simple steps/);
  assert.equal(tree.root.findAllByType('TextInput').length, 0);
  const setup = tree.root.findAllByType('Pressable').find(node => node.findByType('Text').children[0] === 'Set up this phone');
  await act(async () => setup.props.onPress());
  assert.equal(tree.root.findAllByType('TextInput').length, 2);
  await act(async () => tree.unmount());
});

test('cached home opens while API is stalled and refreshes do not overlap', async () => {
  let requests = 0, interval;
  const values = { employeeId: 'one', employeeCache: { employeeId: 'one', name: 'Saved Employee', tasks: [] } };
  const { default: App } = load('../App.tsx', {
    './src/EmployeeScreens': { EmployeeScreens },
    'expo-location': { hasStartedLocationUpdatesAsync: async () => false },
    './src/store': { active: async () => null, queueCount: async () => 0,
      credentials: async () => ({ url: 'https://test.invalid', token: 'test' }),
      getValue: async key => values[key] ?? null, setValue: async () => {} },
    './src/tracking': { api: () => { requests++; return new Promise(() => {}); } },
  }, { setInterval: fn => { interval = fn; return 1; }, clearInterval() {} });
  let tree;
  await act(async () => { tree = create(React.createElement(App)); await new Promise(resolve => setImmediate(resolve)); });
  assert.match(text(tree), /Hello, Saved/);
  assert.doesNotMatch(text(tree), /Opening your day/);
  assert.equal(requests, 1);
  await act(async () => { interval(); interval(); });
  assert.equal(requests, 1);
  await act(async () => tree.unmount());
});
