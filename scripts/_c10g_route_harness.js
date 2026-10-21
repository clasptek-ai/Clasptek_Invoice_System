/**
 * scripts/_c10g_route_harness.js — Phase C10G offline test harness (NOT a test).
 *
 * Transpiles a Next.js route handler (TypeScript) in-process and executes it against
 * INJECTED mocks only. Any import that is not explicitly mocked or allow-listed throws,
 * so a route can never silently reach Supabase, LiveKit, Google, or the network.
 * Nothing here proves live database/RLS behaviour.
 */
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.join(__dirname, '..');

function makeNextServerMock() {
  class NextResponse {
    constructor(body, init) {
      this.body = body;
      this.status = (init && init.status) || 200;
    }
    static json(body, init) {
      return new NextResponse(body, init);
    }
    async json() {
      return this.body;
    }
  }
  return { NextResponse, NextRequest: class NextRequest {} };
}

function makeRequest(body) {
  return { json: async () => body, headers: new Map(), url: 'http://localhost/test' };
}

/** Load a TS module with only injected mocks. `mocks` maps import specifiers to module objects. */
function loadWithMocks(relPath, mocks) {
  const fullPath = path.join(ROOT, relPath);
  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  }).outputText;
  const mod = { exports: {} };
  const customRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(mocks, id)) return mocks[id];
    if (id === 'crypto') return require('crypto');
    throw new Error(`C10G harness: unmocked import "${id}" blocked (no live dependencies allowed)`);
  };
  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', js);
  fn(customRequire, mod, mod.exports, process, path.dirname(fullPath));
  return mod.exports;
}

/**
 * Minimal in-memory Supabase-style query builder. Records every filter applied so tests can
 * assert that tenant / assignment filters were actually part of the query.
 */
function makeFakeDb(tables) {
  const queryLog = [];
  return {
    queryLog,
    client: {
      from(table) {
        const filters = [];
        const builder = {
          select() { return builder; },
          eq(col, val) { filters.push([col, val]); return builder; },
          async maybeSingle() {
            queryLog.push({ table, filters: filters.slice() });
            const rows = tables[table] || [];
            const hit = rows.find((r) => filters.every(([c, v]) => r[c] === v));
            return { data: hit ? { ...hit } : null, error: null };
          },
        };
        return builder;
      },
    },
  };
}

module.exports = { ROOT, makeNextServerMock, makeRequest, loadWithMocks, makeFakeDb };
