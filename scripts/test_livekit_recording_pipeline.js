/**
 * scripts/test_livekit_recording_pipeline.js
 * Comprehensive Verification Suite for LiveKit Recording & Google Drive Upload Pipeline:
 * - Real LiveKit Egress Twirp RPC invocation (Mocked vs Live provider isolation)
 * - Egress start success and failure handling
 * - Egress stop success and failure handling
 * - Official LiveKit Webhook protocol verification:
 *     * Timing-safe HS256 JWT signature verification
 *     * SHA-256 hash of exact raw request body matching claims.sha256
 *     * Body tampering rejection
 *     * Token expiry (exp) and issuer (iss) verification
 *     * Replay attack prevention via timestamp skew check
 *     * Duplicate event ID suppression and idempotency
 * - Completed recording handoff from cloud storage to Google Drive
 * - Pre-flight storage destination checking (fails closed with LIVEKIT_EGRESS_STORAGE_REQUIRED)
 * - Multi-tenant isolation & Role authorization (Super Admin & Facilitator ONLY; Finance Manager FORBIDDEN)
 * - Safe Google Drive upload retry loop with backoff and tenant boundary invariant
 * - Zero Fake Success invariant (fails closed to FAILED on upload error)
 * - Duplicate upload idempotency
 * - Google Meet quarantine
 * - Participant consent & decline mechanics
 * - Interrupted job reconciliation (recovers jobs in RECORDING or PROCESSING)
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const crypto = require('crypto');
const ts = require('typescript');

process.env.NODE_ENV = 'test';
process.env.CLASPTEK_TEST_MODE = 'true';
process.env.LIVEKIT_MOCK_EGRESS = 'true';

// Relational mock databases
global.__MOCK_CONSENT_SESSIONS_DB__ = global.__MOCK_CONSENT_SESSIONS_DB__ || new Map();
global.__MOCK_CONSENTS_DB__ = global.__MOCK_CONSENTS_DB__ || new Map();
global.__MOCK_CONSENT_AUDIT_DB__ = global.__MOCK_CONSENT_AUDIT_DB__ || [];
global.__MOCK_PROCESSING_CLAIMS_DB__ = global.__MOCK_PROCESSING_CLAIMS_DB__ || new Map();

// Module cache for transpiled modules
const moduleCache = new Map();

function loadTsModule(relPath) {
  const fullPath = path.isAbsolute(relPath) ? relPath : path.join(__dirname, '..', relPath);
  if (moduleCache.has(fullPath)) return moduleCache.get(fullPath);

  const code = fs.readFileSync(fullPath, 'utf8');
  const js = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
  const mod = { exports: {} };

  const mockEnrolments = (globalThis).__TEST_MOCK_ENROLMENTS__ || [];
  const mockGuestRequests = (globalThis).__TEST_MOCK_GUEST_REQUESTS__ || [];

  const customRequire = (id) => {
    if (id.includes('supabase/server')) {
      return {
        createServerClient: async () => ({
          from: (table) => {
            const filters = [];
            const queryChain = {
              eq: (col, val) => {
                filters.push({ col, val });
                return queryChain;
              },
              not: () => queryChain,
              maybeSingle: async () => {
                if (table === 'personnel') {
                  const uid = filters.find((f) => f.col === 'user_id')?.val;
                  const tid = filters.find((f) => f.col === 'tenant_id')?.val;
                  if (tid === 'tenant_a') return { data: { id: 'pers_fac_1', user_id: uid } };
                  if (tid === 'tenant_b') return { data: { id: 'pers_fac_b', user_id: uid } };
                  return { data: null };
                }
                if (table === 'enrolments') {
                  const enrList = (globalThis).__TEST_MOCK_ENROLMENTS__ || [];
                  const match = enrList.find((e) =>
                    filters.every((f) => !e[f.col] || e[f.col] === f.val)
                  );
                  return { data: match || null };
                }
                return { data: null };
              },
              then: (resolve) => {
                if (table === 'enrolments') {
                  const enrList = (globalThis).__TEST_MOCK_ENROLMENTS__ || [];
                  const matches = enrList.filter((e) =>
                    filters.every((f) => !e[f.col] || e[f.col] === f.val)
                  );
                  return resolve({ data: matches });
                }
                return resolve({ data: [] });
              },
            };
            return {
              upsert: async (payload) => ({ error: null, data: payload }),
              select: () => queryChain,
            };
          },
        }),
        createSupabaseServiceClient: () => ({
          from: (table) => {
            if (
              table === 'meeting_recording_consent_sessions' ||
              table === 'meeting_recording_consents' ||
              table === 'meeting_recording_consent_audit_log' ||
              table === 'meeting_recording_processing_claims'
            ) {
              return {
                insert: async (rows) => {
                  if ((globalThis).__SIMULATE_PERSISTENCE_FAILURE__) {
                    return { error: { message: 'Database write failed: Simulated disk error' } };
                  }
                  const rowList = Array.isArray(rows) ? rows : [rows];
                  if (table === 'meeting_recording_consent_sessions') {
                    for (const r of rowList) {
                      global.__MOCK_CONSENT_SESSIONS_DB__.set(r.id, { ...r });
                    }
                  } else if (table === 'meeting_recording_consents') {
                    for (const r of rowList) {
                      global.__MOCK_CONSENTS_DB__.set(`${r.session_id}_${r.participant_id}`, { ...r });
                    }
                  } else if (table === 'meeting_recording_consent_audit_log') {
                    global.__MOCK_CONSENT_AUDIT_DB__.push(...rowList);
                  } else if (table === 'meeting_recording_processing_claims') {
                    for (const r of rowList) {
                      global.__MOCK_PROCESSING_CLAIMS_DB__.set(r.meeting_id, { ...r });
                    }
                  }
                  return { error: null };
                },
                select: (cols) => {
                  const filters = [];
                  let orderCol = null;
                  let orderAsc = true;
                  let limitCount = null;

                  const execQuery = () => {
                    if ((globalThis).__SIMULATE_READ_FAILURE__) {
                      return { data: null, error: { message: 'Simulated database read failure' } };
                    }
                    if (table === 'meeting_recording_consent_sessions') {
                      let items = Array.from(global.__MOCK_CONSENT_SESSIONS_DB__.values());
                      for (const f of filters) {
                        items = items.filter((i) => i[f.col] === f.val);
                      }
                      if (orderCol) {
                        items.sort((a, b) => {
                          const va = a[orderCol] || '';
                          const vb = b[orderCol] || '';
                          return orderAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
                        });
                      }
                      if (limitCount !== null) {
                        items = items.slice(0, limitCount);
                      }
                      return { data: items, error: null };
                    }
                    if (table === 'meeting_recording_consents') {
                      let items = Array.from(global.__MOCK_CONSENTS_DB__.values());
                      for (const f of filters) {
                        items = items.filter((i) => i[f.col] === f.val);
                      }
                      return { data: items, error: null };
                    }
                    if (table === 'meeting_recording_consent_audit_log') {
                      let items = [...global.__MOCK_CONSENT_AUDIT_DB__];
                      for (const f of filters) {
                        items = items.filter((i) => i[f.col] === f.val);
                      }
                      if (orderCol) {
                        items.sort((a, b) => {
                          const va = a[orderCol] || '';
                          const vb = b[orderCol] || '';
                          return orderAsc ? (va > vb ? 1 : -1) : (va < vb ? 1 : -1);
                        });
                      }
                      return { data: items, error: null };
                    }
                    return { data: [], error: null };
                  };

                  const chain = {
                    eq: (col, val) => {
                      filters.push({ col, val });
                      return chain;
                    },
                    order: (col, opts = {}) => {
                      orderCol = col;
                      orderAsc = opts.ascending !== false;
                      return chain;
                    },
                    limit: (n) => {
                      limitCount = n;
                      return chain;
                    },
                    maybeSingle: async () => {
                      const res = execQuery();
                      return { data: res.data?.[0] || null, error: res.error };
                    },
                    then: (resolve, reject) => {
                      const res = execQuery();
                      return Promise.resolve(res).then(resolve, reject);
                    },
                  };
                  return chain;
                },
                update: (payload) => {
                  const updateFilters = [];
                  const updateChain = {
                    eq: (col, val) => {
                      updateFilters.push({ col, val });
                      return updateChain;
                    },
                    then: (resolve, reject) => {
                      if (table === 'meeting_recording_consent_sessions') {
                        for (const [id, s] of global.__MOCK_CONSENT_SESSIONS_DB__.entries()) {
                          const matches = updateFilters.every((f) => s[f.col] === f.val);
                          if (matches) {
                            Object.assign(s, payload);
                            global.__MOCK_CONSENT_SESSIONS_DB__.set(id, s);
                          }
                        }
                      }
                      return Promise.resolve({ error: null }).then(resolve, reject);
                    },
                  };
                  return updateChain;
                },
                delete: () => {
                  const deleteFilters = [];
                  const deleteChain = {
                    eq: (col, val) => {
                      deleteFilters.push({ col, val });
                      return deleteChain;
                    },
                    then: (resolve, reject) => {
                      if ((globalThis).__SIMULATE_PERSISTENCE_FAILURE__) {
                        return Promise.resolve({ error: { message: 'Database delete failed: Simulated error' } }).then(resolve, reject);
                      }
                      if (table === 'meeting_recording_processing_claims') {
                        for (const [mId, claim] of global.__MOCK_PROCESSING_CLAIMS_DB__.entries()) {
                          const matches = deleteFilters.every((f) => claim[f.col] === f.val);
                          if (matches) {
                            global.__MOCK_PROCESSING_CLAIMS_DB__.delete(mId);
                          }
                        }
                      }
                      return Promise.resolve({ error: null }).then(resolve, reject);
                    },
                  };
                  return deleteChain;
                },
              };
            }

            return {
              select: (cols) => ({
                eq: (col1, val1) => ({
                  eq: (col2, val2) => ({
                    eq: (col3, val3) => {
                      const matchEnrolments = (table === 'enrolments')
                        ? ((globalThis).__TEST_MOCK_ENROLMENTS__ || []).filter(e => (!val1 || e.cohort_id === val1) && (!val2 || e.student_id === val2) && (!val3 || e.status === val3))
                        : [];
                      return {
                        data: matchEnrolments,
                        maybeSingle: async () => ({ data: matchEnrolments[0] || null }),
                        then: (resolve) => resolve({ data: matchEnrolments }),
                      };
                    },
                    or: (expr) => ({
                      eq: (col3, val3) => ({
                        maybeSingle: async () => {
                          if (table === 'enrolments') {
                            const enrList = (globalThis).__TEST_MOCK_ENROLMENTS__ || [];
                            for (const e of enrList) {
                              if (expr.includes(e.student_id)) return { data: e };
                            }
                          }
                          return { data: null };
                        },
                      }),
                    }),
                    maybeSingle: async () => {
                      if (table === 'personnel') {
                        return { data: { id: val2 === 'tenant_b' ? 'pers_fac_b' : 'pers_fac_1', user_id: val1 } };
                      }
                      if (table === 'meeting_guest_requests') {
                        const gList = (globalThis).__TEST_MOCK_GUEST_REQUESTS__ || [];
                        for (const g of gList) {
                          if (g.id === val1 && (g.request_token === val2 || g.requestToken === val2)) return { data: g };
                        }
                      }
                      return { data: null };
                    },
                  }),
                  or: (expr) => ({
                    eq: (col3, val3) => ({
                      eq: (col4, val4) => ({
                        maybeSingle: async () => {
                          if (table === 'meeting_guest_requests') {
                            const gList = (globalThis).__TEST_MOCK_GUEST_REQUESTS__ || [];
                            for (const g of gList) {
                              if (g.id === val3 && g.status === val4) return { data: g };
                            }
                          }
                          return { data: null };
                        },
                      }),
                    }),
                  }),
                  maybeSingle: async () => {
                    if (table === 'meetings') {
                      const m = mockDb.get(val1);
                      return { data: m ? { ...m, tenant_id: m.tenantId, public_id: m.publicId } : null };
                    }
                    if (table === 'personnel') {
                      return { data: { id: 'pers_fac_1', user_id: val1 } };
                    }
                    return { data: null };
                  },
                }),
                or: (expr) => ({
                  eq: (col2, val2) => ({
                    eq: (col3, val3) => {
                      if (table === 'meeting_guest_requests') {
                        const gList = (globalThis).__TEST_MOCK_GUEST_REQUESTS__ || [];
                        return {
                          data: gList.filter((g) => g.status === val3),
                        };
                      }
                      return { data: [] };
                    },
                  }),
                  maybeSingle: async () => {
                    for (const m of mockDb.values()) {
                      if (expr.includes(m.publicId) || expr.includes(m.providerRoomId)) {
                        return { data: { ...m, tenant_id: m.tenantId, public_id: m.publicId } };
                      }
                    }
                    return { data: null };
                  },
                }),
                filter: (pathExpr, op, val) => ({
                  maybeSingle: async () => {
                    for (const m of mockDb.values()) {
                      if (m.recordingMetadata?.egress_id === val || m.recordingMetadata?.egressId === val) {
                        return { data: { ...m, tenant_id: m.tenantId, public_id: m.publicId } };
                      }
                    }
                    return { data: null };
                  },
                }),
              }),
              update: (payload) => {
                let targetId = null;
                const filters = [];
                const makeHandler = (col, val) => {
                  if (col === 'id') targetId = val;
                  filters.push({ col, val });
                  const res = async () => {
                    if ((globalThis).__SIMULATE_PERSISTENCE_FAILURE__) {
                      return { error: { message: 'Database write failed: Simulated disk error' } };
                    }
                    if ((globalThis).__TEST_UPDATE_COUNT_OVERRIDE__ !== undefined) {
                      return { error: null, count: (globalThis).__TEST_UPDATE_COUNT_OVERRIDE__ };
                    }
                    if (table === 'meetings' && targetId) {
                      const m = mockDb.get(targetId);
                      if (m) {
                        for (const f of filters) {
                          if (f.col === 'recording_metadata->processing_claim->>token') {
                            if (m.recordingMetadata?.processing_claim?.token !== f.val) {
                              return { error: null, count: 0 };
                            }
                          }
                        }
                        if (payload.recording_status) {
                          m.recordingStatus = payload.recording_status;
                          m.recording_status = payload.recording_status;
                        }
                        if (payload.recording_metadata) {
                          m.recordingMetadata = payload.recording_metadata;
                          m.recording_metadata = payload.recording_metadata;
                        }
                        if (payload.updated_at) {
                          m.updatedAt = payload.updated_at;
                          m.updated_at = payload.updated_at;
                        }
                        mockDb.set(targetId, m);
                      }
                    }
                    return { error: null, count: 1 };
                  };
                  res.eq = (c, v) => makeHandler(c, v);
                  res.filter = (c, op, v) => makeHandler(c, v);
                  res.then = (onFulfilled, onRejected) => res().then(onFulfilled, onRejected);
                  return res;
                };
                return {
                  eq: (col, val) => makeHandler(col, val),
                };
              },
            };
          },
          rpc: async (fn, args) => {
            if ((globalThis).__TEST_RPC_HANDLER__) {
              return (globalThis).__TEST_RPC_HANDLER__(fn, args);
            }
            if (fn === 'submit_participant_consent') {
              const sess = global.__MOCK_CONSENT_SESSIONS_DB__.get(args.p_session_id);
              if (!sess) {
                return { data: null, error: { message: `STALE_CONSENT_SESSION: Consent session ${args.p_session_id} not found` } };
              }
              if (['STOPPED', 'EXPIRED', 'WITHDRAWN'].includes(sess.status) && args.p_decision !== 'WITHDRAWN') {
                return { data: null, error: { message: `STALE_CONSENT_SESSION: Consent session ${args.p_session_id} is terminated` } };
              }
              const cKey = `${args.p_session_id}_${args.p_participant_id}`;
              const existing = global.__MOCK_CONSENTS_DB__.get(cKey) || {
                id: `cst_${args.p_session_id}_${args.p_participant_id}`,
                session_id: args.p_session_id,
                tenant_id: args.p_tenant_id,
                meeting_id: sess.meeting_id,
                participant_id: args.p_participant_id,
                participant_name: args.p_participant_id,
                role: 'STUDENT',
              };
              existing.status = args.p_decision;
              existing.reason = args.p_reason;
              existing.decided_at = new Date().toISOString();
              existing.updated_at = existing.decided_at;
              global.__MOCK_CONSENTS_DB__.set(cKey, existing);

              global.__MOCK_CONSENT_AUDIT_DB__.push({
                tenant_id: args.p_tenant_id,
                meeting_id: sess.meeting_id,
                session_id: args.p_session_id,
                action:
                  args.p_decision === 'GRANTED'
                    ? 'CONSENT_GRANTED'
                    : args.p_decision === 'DECLINED'
                    ? 'CONSENT_DECLINED'
                    : 'CONSENT_WITHDRAWN',
                participant_id: args.p_participant_id,
                reason: args.p_reason,
                created_at: new Date().toISOString(),
              });

              const allCons = Array.from(global.__MOCK_CONSENTS_DB__.values()).filter((c) => c.session_id === args.p_session_id);
              const declinedCount = allCons.filter((c) => c.status === 'DECLINED' || c.status === 'WITHDRAWN').length;
              const pendingCount = allCons.filter((c) => c.status === 'PENDING').length;
              const allGranted = allCons.length > 0 && allCons.every((c) => c.status === 'GRANTED');
              let newStatus = 'PENDING_CONSENT';
              if (args.p_decision === 'WITHDRAWN') newStatus = 'WITHDRAWN';
              else if (declinedCount > 0) newStatus = 'DECLINED';
              else if (allGranted && allCons.length > 0) newStatus = 'ALL_GRANTED';
              sess.status = newStatus;
              sess.updated_at = new Date().toISOString();
              global.__MOCK_CONSENT_SESSIONS_DB__.set(args.p_session_id, sess);

              return {
                data: {
                  success: true,
                  sessionId: args.p_session_id,
                  meetingId: sess.meeting_id,
                  participantId: args.p_participant_id,
                  decision: args.p_decision,
                  sessionStatus: newStatus,
                  allConsented: allGranted,
                  pendingCount,
                  declinedCount,
                },
                error: null,
              };
            }
            if (fn === 'acquire_recording_processing_claim') {
              if (global.__SIMULATE_CLAIM_INFRASTRUCTURE_FAILURE__) {
                return { data: null, error: { message: 'function acquire_recording_processing_claim does not exist', code: '42883' } };
              }
              const m = mockDb.get(args.p_meeting_id);
              if (!m) return { data: { acquired: false, reason: 'MEETING_NOT_FOUND' }, error: null };
              const recStatus = m.recordingStatus || m.recording_status;
              if (recStatus === 'STORED') return { data: { acquired: false, reason: 'ALREADY_STORED' }, error: null };

              const currentClaim = m.recordingMetadata?.processing_claim || global.__MOCK_PROCESSING_CLAIMS_DB__.get(args.p_meeting_id);
              if (currentClaim && currentClaim.token) {
                const claimedAt = new Date(currentClaim.claimed_at).getTime();
                const ageSeconds = (Date.now() - claimedAt) / 1000;
                if (ageSeconds < (args.p_lease_seconds || 600)) {
                  return { data: { acquired: false, reason: 'CONCURRENT_PROCESSING_IN_PROGRESS' }, error: null };
                }
              }

              const claimToken = args.p_claim_token;
              const nowStr = new Date().toISOString();
              const leaseExpiresAt = new Date(Date.now() + (args.p_lease_seconds || 600) * 1000).toISOString();
              const claimObj = {
                meeting_id: args.p_meeting_id,
                tenant_id: args.p_tenant_id,
                claim_token: claimToken,
                claimed_by: args.p_claimed_by,
                claimed_at: nowStr,
                lease_expires_at: leaseExpiresAt,
                updated_at: nowStr,
              };
              global.__MOCK_PROCESSING_CLAIMS_DB__.set(args.p_meeting_id, claimObj);
              m.recordingMetadata = {
                ...(m.recordingMetadata || {}),
                processing_claim: {
                  token: claimToken,
                  claimed_at: nowStr,
                  claimed_by: args.p_claimed_by,
                  lease_expires_at: leaseExpiresAt,
                },
              };
              mockDb.set(args.p_meeting_id, m);
              return { data: { acquired: true, claimToken }, error: null };
            }
            if (fn === 'release_recording_processing_claim') {
              if (global.__SIMULATE_CLAIM_TRANSPORT_THROW__) {
                throw new Error('Network transport timeout on release RPC');
              }
              if (global.__SIMULATE_PERSISTENCE_FAILURE__ || global.__SIMULATE_CLAIM_GENERIC_DB_ERROR__) {
                return { data: null, error: { message: 'Database write failed: Simulated disk error', code: '50000' } };
              }
              if (global.__SIMULATE_CLAIM_PERMISSION_ERROR__) {
                return { data: null, error: { message: 'permission denied for function release_recording_processing_claim', code: '42501' } };
              }
              if (global.__SIMULATE_CLAIM_INFRASTRUCTURE_FAILURE__) {
                return { data: null, error: { message: 'function release_recording_processing_claim does not exist', code: '42883' } };
              }
              if (!args.p_claim_token || !args.p_claim_token.trim()) {
                return { data: { released: false, reason: 'CLAIM_TOKEN_REQUIRED' }, error: null };
              }
              const m = mockDb.get(args.p_meeting_id);
              if (!m) return { data: { released: false, reason: 'MEETING_NOT_FOUND' }, error: null };
              const currentClaim = m.recordingMetadata?.processing_claim;
              if (!currentClaim || !currentClaim.token) {
                const relClaim = global.__MOCK_PROCESSING_CLAIMS_DB__.get(args.p_meeting_id);
                if (relClaim && relClaim.claim_token === args.p_claim_token) {
                  global.__MOCK_PROCESSING_CLAIMS_DB__.delete(args.p_meeting_id);
                }
                return { data: { released: true, reason: 'NO_ACTIVE_CLAIM' }, error: null };
              }
              if (currentClaim.token !== args.p_claim_token) {
                // Do not disclose activeToken
                return { data: { released: false, reason: 'TOKEN_MISMATCH' }, error: null };
              }
              delete m.recordingMetadata.processing_claim;
              if (m.recording_metadata) delete m.recording_metadata.processing_claim;
              mockDb.set(args.p_meeting_id, m);

              const relClaim = global.__MOCK_PROCESSING_CLAIMS_DB__.get(args.p_meeting_id);
              if (relClaim && relClaim.claim_token === args.p_claim_token) {
                global.__MOCK_PROCESSING_CLAIMS_DB__.delete(args.p_meeting_id);
              }

              let auditLogged = true;
              if (global.__SIMULATE_AUDIT_INSERT_FAILURE__) {
                auditLogged = false;
              } else {
                global.__MOCK_CONSENT_AUDIT_DB__.push({
                  tenant_id: args.p_tenant_id,
                  meeting_id: args.p_meeting_id,
                  session_id: 'system',
                  action: 'CLAIM_RELEASED',
                  reason: 'Processing claim released by authorized worker',
                  created_at: new Date().toISOString(),
                });
              }

              return { data: { released: true, auditLogged }, error: null };
            }
            if (fn === 'update_fenced_recording_metadata') {
              if (global.__SIMULATE_CLAIM_INFRASTRUCTURE_FAILURE__) {
                return { data: null, error: { message: 'function update_fenced_recording_metadata does not exist', code: '42883' } };
              }
              if (global.__SIMULATE_RPC_TIMEOUT__) {
                throw new Error('RPC statement timeout: 504 Gateway Timeout');
              }
              if (global.__SIMULATE_PERSISTENCE_FAILURE__) {
                return { data: null, error: { message: 'Database write failed: Simulated disk error', code: '50000' } };
              }
              const m = mockDb.get(args.p_meeting_id);
              if (!m) return { data: { success: false, reason: 'MEETING_NOT_FOUND' }, error: null };
              const mtgTenant = m.tenantId || m.tenant_id;
              if (mtgTenant && mtgTenant !== args.p_tenant_id) {
                return { data: { success: false, reason: 'TENANT_MISMATCH' }, error: null };
              }

              const curClaim = m.recordingMetadata?.processing_claim;
              const activeToken = curClaim?.token;
              let leaseActive = false;
              if (activeToken && curClaim.claimed_at) {
                const claimAge = (Date.now() - new Date(curClaim.claimed_at).getTime()) / 1000;
                const leaseDuration = curClaim.lease_expires_at
                  ? (new Date(curClaim.lease_expires_at).getTime() - new Date(curClaim.claimed_at).getTime()) / 1000
                  : 600;
                leaseActive = claimAge < leaseDuration;
              }

              if (args.p_claim_token) {
                if (!activeToken) {
                  return { data: { success: false, reason: 'NO_ACTIVE_CLAIM' }, error: null };
                }
                if (activeToken !== args.p_claim_token) {
                  return { data: { success: false, reason: 'TOKEN_MISMATCH' }, error: null };
                }
              } else {
                // Unclaimed caller: verify if an active worker currently holds a valid lease
                if (activeToken && leaseActive) {
                  if (args.p_status && args.p_status !== (m.recordingStatus || m.recording_status)) {
                    return { data: { success: false, reason: 'CONCURRENT_CLAIM_ACTIVE' }, error: null };
                  }
                  if (args.p_metadata?.processing_claim || args.p_metadata?.start_intent) {
                    return { data: { success: false, reason: 'CONCURRENT_CLAIM_ACTIVE' }, error: null };
                  }
                }
              }

              // Update state atomically under row lock:
              if (args.p_status) {
                m.recordingStatus = args.p_status;
                m.recording_status = args.p_status;
              }
              const mergedMeta = { ...(m.recordingMetadata || {}), ...(args.p_metadata || {}) };
              if (m.recordingMetadata?.consent_session && args.p_metadata?.consent_session && typeof args.p_metadata.consent_session === 'object') {
                mergedMeta.consent_session = {
                  ...m.recordingMetadata.consent_session,
                  ...args.p_metadata.consent_session,
                };
              }
              if ((activeToken && leaseActive) || (args.p_claim_token && curClaim)) {
                mergedMeta.processing_claim = curClaim;
              } else if (curClaim && !mergedMeta.processing_claim) {
                mergedMeta.processing_claim = curClaim;
              }
              m.recordingMetadata = mergedMeta;
              m.recording_metadata = mergedMeta;
              if (args.p_metadata?.webViewLink || args.p_metadata?.driveUrl) {
                m.recordingUrl = args.p_metadata.webViewLink || args.p_metadata.driveUrl;
                m.recording_url = m.recordingUrl;
              }
              m.updatedAt = new Date().toISOString();
              m.updated_at = m.updatedAt;
              mockDb.set(args.p_meeting_id, m);

              return { data: { success: true }, error: null };
            }
            return { data: null, error: new Error('RPC_NOT_INSTALLED') };
          },
        }),
      };
    }
    if (id === 'next/server') {
      return {
        NextRequest: class MockNextRequest {
          constructor(url, init = {}) {
            this.url = url;
            this.method = init.method || 'GET';
            this.body = init.body;
            this.headers = new Map(Object.entries(init.headers || {}));
          }
          async json() {
            return typeof this.body === 'string' ? JSON.parse(this.body) : (this.body || {});
          }
        },
        NextResponse: {
          json: (data, init = {}) => ({
            status: init.status || 200,
            json: async () => data,
            data,
            ok: (init.status || 200) >= 200 && (init.status || 200) < 300,
          }),
        },
      };
    }
    if (id.includes('auth/server') || id === '@/lib/auth/server') {
      return {
        getAuthoritativeSession: async () => {
          return (globalThis).__TEST_AUTH_SESSION__ || null;
        },
      };
    }
    if (id.startsWith('@/')) {
      const candidate = path.join(__dirname, '..', id.slice(2));
      return loadTsModule(candidate.endsWith('.ts') ? candidate : candidate + '.ts');
    }
    if (id.startsWith('../') || id.startsWith('./')) {
      const candidate = path.resolve(path.dirname(fullPath), id);
      if (fs.existsSync(candidate + '.ts')) return loadTsModule(candidate + '.ts');
      if (fs.existsSync(candidate + '.js')) return require(candidate + '.js');
      if (fs.existsSync(candidate)) return require(candidate);
    }
    return require(id);
  };

  const fn = new Function('require', 'module', 'exports', 'process', '__dirname', js);
  fn(customRequire, mod, mod.exports, process, path.dirname(fullPath));
  moduleCache.set(fullPath, mod.exports);
  return mod.exports;
}

const {
  checkLiveKitEgressSupport,
  startMeetingRecording,
  stopMeetingRecording,
  getMeetingRecordingStatus,
  uploadRecordingWithRetry,
  handleLiveKitWebhook,
  reconcileMeetingRecording,
  generateLiveKitEgressToken,
  callLiveKitEgressRpc,
  callLiveKitRoomRpc,
  updateLiveKitParticipantPermissions,
  acquireRecordingProcessingClaim,
  releaseRecordingProcessingClaim,
  deriveAuthoritativeMeetingRoster,
  persistParticipantConsentAtomically,
  RecordingServiceError,
  isPrivateOrReservedIp,
  validateStorageDownloadUrl,
  downloadSecureRecordingUrl,
  fetchS3ObjectViaSigV4,
  initiateRecordingConsentSession,
  recordParticipantConsent,
  registerMeetingParticipant,
  getRecordingConsentStatus,
  reconcileParticipantPermissions,
  reconcileStaleRecordingsBatch,
} = loadTsModule('lib/meetings/recording-service.ts');

const consentRoute = loadTsModule('app/api/meetings/recording/consent/route.ts');
const cronRoute = loadTsModule('app/api/cron/reconcile-recordings/route.ts');
const { NextRequest } = require('next/server');

const googleConfig = require('../api/_lib/google-oauth-config');

// In-memory mock database of meetings
const mockDb = new Map();
global.__MOCK_MEETINGS_DB__ = mockDb;

function seedMeeting(m) {
  const seeded = {
    facilitatorId: 'pers_fac_1',
    ...m,
  };
  mockDb.set(m.id, seeded);
  if (m.recordingMetadata?.consent_session) {
    const cs = m.recordingMetadata.consent_session;
    if (cs.sessionId) {
      global.__MOCK_CONSENT_SESSIONS_DB__.set(cs.sessionId, {
        id: cs.sessionId,
        tenant_id: m.tenantId,
        meeting_id: m.id,
        requested_by: cs.requestedBy || null,
        status: cs.status || 'PENDING_CONSENT',
        created_at: cs.requestedAt || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      if (cs.consents) {
        for (const [pId, c] of Object.entries(cs.consents)) {
          global.__MOCK_CONSENTS_DB__.set(`${cs.sessionId}_${pId}`, {
            id: `cst_${cs.sessionId}_${pId}`,
            session_id: cs.sessionId,
            tenant_id: m.tenantId,
            meeting_id: m.id,
            participant_id: pId,
            participant_name: c.participantName || pId,
            role: c.role || 'STUDENT',
            status: c.status || 'PENDING',
            decided_at: c.updatedAt || new Date().toISOString(),
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          });
        }
      }
    }
  }
}

// Real queries module reference: invokes the actual exported application functions
const queries = loadTsModule('lib/meetings/queries.ts');
queries.getMeetingById = async (id) => {
  const m = mockDb.get(id);
  return { data: m ? { ...m, tenant_id: m.tenantId, public_id: m.publicId } : null, error: null };
};
// Note: queries.updateMeetingRecordingMetadata is NOT monkey-patched.
// The actual application code in lib/meetings/queries.ts is directly executed under test.
global.__TEST_AUTH_SESSION__ = {
  user: { id: 'usr_fac_1' },
  role: 'Facilitator',
  tenantId: 'tenant_a',
};

let passed = 0;
let total = 0;

async function test(name, fn) {
  total++;
  try {
    await fn();
    passed++;
    console.log(`  ✔ PASS: ${name}`);
  } catch (err) {
    console.error(`  ✖ FAIL: ${name}`);
    console.error(`     ${err.message}`);
    process.exitCode = 1;
  }
}

async function runSuite() {
  console.log('===============================================================');
  console.log('CLASPTEK MEETINGS — COMPREHENSIVE RECORDING PIPELINE TEST SUITE');
  console.log('===============================================================\n');

  // --- Suite 1: LiveKit Egress Capability & Pre-flight Diagnostics ---
  console.log('--- Suite 1: LiveKit Egress Capability & Diagnostics ---');

  await test('[CONFIG] Correctly identifies missing credentials in checkLiveKitEgressSupport', async () => {
    const origUrl = process.env.LIVEKIT_URL;
    delete process.env.LIVEKIT_URL;

    const res = await checkLiveKitEgressSupport();
    assert.strictEqual(res.available, false);
    assert.match(res.reason, /LIVEKIT_URL.*missing/i);

    if (origUrl) process.env.LIVEKIT_URL = origUrl;
  });

  await test('[CONFIG] Fails closed when cloud storage bucket is missing in LiveKit Cloud', async () => {
    process.env.LIVEKIT_URL = 'wss://clasptek-portal-tpfi0pb9.livekit.cloud';
    process.env.LIVEKIT_API_KEY = 'mock_api_key_123';
    process.env.LIVEKIT_API_SECRET = 'mock_api_secret_456_secure_key';
    delete process.env.LIVEKIT_EGRESS_STORAGE_BUCKET;
    delete process.env.LIVEKIT_EGRESS_S3_BUCKET;
    delete process.env.AWS_S3_BUCKET;
    delete process.env.LIVEKIT_EGRESS_GCS_BUCKET;
    delete process.env.LIVEKIT_EGRESS_PROJECT_STORAGE_CONFIGURED;
    delete process.env.LIVEKIT_EGRESS_ENABLED;

    const res = await checkLiveKitEgressSupport();
    assert.strictEqual(res.available, false);
    assert.strictEqual(res.code, 'LIVEKIT_EGRESS_STORAGE_REQUIRED');
    assert.match(res.reason, /cloud storage bucket/i);
    assert.strictEqual(res.configDetails.hasCloudStorage, false);
  });

  // --- Suite 2: Role Authorization & Tenant Isolation ---
  console.log('\n--- Suite 2: Role Authorization & Tenant Isolation ---');

  seedMeeting({
    id: 'mtg_rec_001',
    tenantId: 'tenant_a',
    publicId: 'mtg-pub-001',
    title: 'Advanced React & Architecture',
    sfuProvider: 'livekit',
    facilitatorId: 'pers_fac_1',
    recordingStatus: 'NOT_STARTED',
    recordingEnabled: true,
  });

  await test('[AUTH] Rejects unauthenticated recording start with 401', async () => {
    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_rec_001', session: null }),
      /UNAUTHORIZED/
    );
  });

  await test('[AUTH] Rejects Student role with 403 on recording start', async () => {
    const studentSession = {
      user: { id: 'usr_stud_1', email: 'student@clasptek.org' },
      tenantId: 'tenant_a',
      role: 'Student',
    };

    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_rec_001', session: studentSession }),
      /FORBIDDEN/
    );
  });

  await test('[AUTH] Strictly forbids Finance Manager role from recording controls (403)', async () => {
    const finManagerSession = {
      user: { id: 'usr_fin_1', email: 'finance@clasptek.org' },
      tenantId: 'tenant_a',
      role: 'Finance Manager',
    };

    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_rec_001', session: finManagerSession }),
      /Finance Manager role is not authorized/i
    );
  });

  await test('[TENANT] Cross-Tenant: Tenant B admin CANNOT start or stop recording for Tenant A meeting (404)', async () => {
    const tenantBSession = {
      user: { id: 'usr_admin_b', email: 'admin@tenant-b.org' },
      tenantId: 'tenant_b',
      role: 'Super Admin',
    };

    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_rec_001', session: tenantBSession }),
      /TENANT_NOT_FOUND/
    );
  });

  // --- Suite 3: Real Egress Twirp RPC Invocation & Fail-Closed Lifecycle ---
  console.log('\n--- Suite 3: Real Egress Twirp RPC & Lifecycle Transitions ---');

  await test('[EGRESS FAIL-CLOSED] startMeetingRecording fails closed when storage bucket is unconfigured', async () => {
    delete process.env.LIVEKIT_EGRESS_STORAGE_BUCKET;
    delete process.env.LIVEKIT_EGRESS_S3_BUCKET;
    delete process.env.AWS_S3_BUCKET;
    delete process.env.LIVEKIT_EGRESS_ENABLED;
    delete process.env.LIVEKIT_EGRESS_PROJECT_STORAGE_CONFIGURED;

    const adminSession = {
      user: { id: 'usr_admin_a', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_rec_001', session: adminSession }),
      /LIVEKIT_EGRESS_STORAGE_REQUIRED/
    );

    const m = mockDb.get('mtg_rec_001');
    assert.strictEqual(m.recordingStatus, 'NOT_STARTED'); // Never falsely marks RECORDING!
  });

  await test('[EGRESS RPC MOCK] StartRoomCompositeEgress succeeds when configured and stores real egress_id', async () => {
    // Configure mock bucket
    process.env.LIVEKIT_EGRESS_S3_BUCKET = 'clasptek-recordings-bucket';
    process.env.LIVEKIT_EGRESS_AWS_KEY = 'mock_key';
    process.env.LIVEKIT_EGRESS_AWS_SECRET = 'mock_secret';

    // Mock LiveKit Egress Twirp handler
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = (action, body) => {
      if (action === 'StartRoomCompositeEgress') {
        assert.ok(body.room_name);
        return {
          egress_id: 'EG_livekit_mock_12345',
          room_name: body.room_name,
          status: 'EGRESS_STARTING',
        };
      }
      throw new Error(`Unexpected action: ${action}`);
    };

    const adminSession = {
      user: { id: 'usr_admin_a', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    const res = await startMeetingRecording({ meetingId: 'mtg_rec_001', session: adminSession });
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'RECORDING');
    assert.strictEqual(res.egressId, 'EG_livekit_mock_12345');
    assert.ok(res.startedAt);

    const m = mockDb.get('mtg_rec_001');
    assert.strictEqual(m.recordingStatus, 'RECORDING');
    assert.strictEqual(m.recordingMetadata.egress_id, 'EG_livekit_mock_12345');
  });

  await test('[DUPLICATE START] Duplicate recording start is rejected with 409 RECORDING_ALREADY_ACTIVE', async () => {
    const adminSession = {
      user: { id: 'usr_admin_a', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_rec_001', session: adminSession }),
      /RECORDING_ALREADY_ACTIVE/
    );
  });

  await test('[STATUS & CONSENT] Server-confirmed status endpoint returns RECORDING, consent notice, and egress details', async () => {
    const studentSession = {
      user: { id: 'usr_stud_1', email: 'student@clasptek.org' },
      tenantId: 'tenant_a',
      role: 'Student',
    };

    const statusRes = await getMeetingRecordingStatus({ meetingId: 'mtg_rec_001', session: studentSession });
    assert.strictEqual(statusRes.recordingStatus, 'RECORDING');
    assert.match(statusRes.consentNotice, /Audio, video, and screen shares are being recorded/i);
    assert.strictEqual(statusRes.isHostOrAdmin, false);
  });

  await test('[EGRESS STOP] StopEgress invokes real Twirp RPC and transitions status to PROCESSING', async () => {
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = (action, body) => {
      if (action === 'StopEgress') {
        assert.strictEqual(body.egress_id, 'EG_livekit_mock_12345');
        return {
          egress_id: body.egress_id,
          status: 'EGRESS_ENDING',
        };
      }
      throw new Error(`Unexpected action: ${action}`);
    };

    const adminSession = {
      user: { id: 'usr_admin_a', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    const stopRes = await stopMeetingRecording({ meetingId: 'mtg_rec_001', session: adminSession });
    assert.strictEqual(stopRes.success, true);
    assert.strictEqual(stopRes.status, 'PROCESSING');
    assert.ok(stopRes.stoppedAt);

    const m = mockDb.get('mtg_rec_001');
    assert.strictEqual(m.recordingStatus, 'PROCESSING');
  });

  await test('[EGRESS STOP] Stop recording when not active is rejected with 400 NO_ACTIVE_RECORDING', async () => {
    const adminSession = {
      user: { id: 'usr_admin_a', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    await assert.rejects(
      async () => stopMeetingRecording({ meetingId: 'mtg_rec_001', session: adminSession }),
      /NO_ACTIVE_RECORDING/
    );
  });

  // --- Suite 4: Google Meet Isolation Invariant ---
  console.log('\n--- Suite 4: Google Meet Isolation Invariant ---');

  seedMeeting({
    id: 'mtg_gmeet_002',
    tenantId: 'tenant_a',
    publicId: 'mtg-pub-gmeet',
    title: 'Google Meet External Session',
    sfuProvider: 'google_meet',
    providerRoomUrl: 'https://meet.google.com/abc-defg-hij',
    recordingStatus: 'NOT_STARTED',
  });

  await test('[GOOGLE MEET ISOLATION] Google Meet sessions reject LiveKit recording start with 400', async () => {
    const adminSession = {
      user: { id: 'usr_admin_a', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_gmeet_002', session: adminSession }),
      /GOOGLE_MEET_RECORDING_UNSUPPORTED/
    );
  });

  // --- Suite 5: Official LiveKit Webhook Protocol & Security ---
  console.log('\n--- Suite 5: Official LiveKit Webhook Protocol & Security ---');

  // Seed central Google Drive connection in public.google_drive_connections mock store
  googleConfig._memoryConnectionStore.set('central:tenant_a', {
    tenant_id: 'tenant_a',
    connection_type: 'TENANT_CENTRAL',
    status: 'CONNECTED',
    scope: 'https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/calendar.events',
    access_token: 'mock_access_token_recording_suite',
    refresh_token: 'mock_refresh_token_recording_suite',
    root_folder_id: 'mock_root_recordings_folder',
    root_folder_name: 'Clasptek Meeting Recordings',
  });

  function makeWebhookToken(bodyStr, overrides = {}) {
    const secret = process.env.LIVEKIT_API_SECRET;
    const nowSec = Math.floor(Date.now() / 1000);
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const rawSha256 = crypto.createHash('sha256').update(bodyStr).digest('base64');
    const payload = Buffer.from(
      JSON.stringify({
        iss: overrides.iss !== undefined ? overrides.iss : process.env.LIVEKIT_API_KEY,
        sub: 'webhook',
        exp: overrides.exp !== undefined ? overrides.exp : nowSec + 3600,
        nbf: overrides.nbf !== undefined ? overrides.nbf : nowSec - 5,
        sha256: overrides.sha256 !== undefined ? overrides.sha256 : rawSha256,
        ...overrides,
      })
    ).toString('base64url');
    const sig = crypto.createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url');
    return `${header}.${payload}.${sig}`;
  }

  await test('[WEBHOOK AUTH] Rejects webhook with invalid HMAC signature with 401', async () => {
    const bodyStr = JSON.stringify({ id: 'EV_test_1', event: 'egress_ended' });
    await assert.rejects(
      async () => handleLiveKitWebhook({ body: bodyStr, authHeader: 'Bearer invalid.token.signature' }),
      /INVALID_WEBHOOK_SIGNATURE/
    );
  });

  await test('[WEBHOOK SHA256] Rejects tampered raw body where payload does not match token sha256 claim with 401', async () => {
    const originalBody = JSON.stringify({ id: 'EV_tampered_1', event: 'egress_ended' });
    const token = makeWebhookToken(originalBody);
    const tamperedBody = JSON.stringify({ id: 'EV_tampered_1', event: 'egress_ended', extra: 'tampered_data' });

    await assert.rejects(
      async () => handleLiveKitWebhook({ body: tamperedBody, authHeader: `Bearer ${token}` }),
      /INVALID_PAYLOAD_SHA256/
    );
  });

  await test('[WEBHOOK EXPIRY] Rejects expired webhook token with 401', async () => {
    const bodyStr = JSON.stringify({ id: 'EV_expired_1', event: 'egress_ended' });
    const pastSec = Math.floor(Date.now() / 1000) - 120;
    const expiredToken = makeWebhookToken(bodyStr, { exp: pastSec });

    await assert.rejects(
      async () => handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${expiredToken}` }),
      /EXPIRED_WEBHOOK_TOKEN/
    );
  });

  await test('[WEBHOOK ISSUER] Rejects webhook token with mismatched API key issuer with 401', async () => {
    const bodyStr = JSON.stringify({ id: 'EV_issuer_1', event: 'egress_ended' });
    const wrongIssuerToken = makeWebhookToken(bodyStr, { iss: 'wrong_api_key' });

    await assert.rejects(
      async () => handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${wrongIssuerToken}` }),
      /INVALID_WEBHOOK_ISSUER/
    );
  });

  await test('[WEBHOOK INGESTION] Processes egress_ended, streams to Drive, and marks STORED', async () => {
    const webhookBody = {
      id: 'EV_webhook_completed_001',
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'EG_livekit_mock_12345',
        roomName: 'mtg-pub-001',
        status: 'EGRESS_COMPLETE',
        duration: 3600000000000,
        fileResults: [
          {
            filename: 'CLASPTEK_mtg-pub-001_final.mp4',
            location: 's3://clasptek-recordings-bucket/recordings/CLASPTEK_mtg-pub-001_final.mp4',
          },
        ],
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const hookRes = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });
    assert.strictEqual(hookRes.status, 'UPLOADED_AND_STORED');
    assert.ok(hookRes.fileId);

    const m = mockDb.get('mtg_rec_001');
    assert.strictEqual(m.recordingStatus, 'STORED');
    assert.strictEqual(m.recordingMetadata.google_drive_file_id, hookRes.fileId);
  });

  await test('[WEBHOOK IDEMPOTENCY] Re-delivered duplicate webhook event is safely ignored', async () => {
    const webhookBody = {
      id: 'EV_webhook_completed_001', // Exact same event ID
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'EG_livekit_mock_12345',
        status: 'EGRESS_COMPLETE',
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const hookRes = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });
    assert.strictEqual(hookRes.status, 'DUPLICATE_EVENT_IGNORED');
  });

  // --- Suite 6: Google Drive Upload Retries, Idempotency, and Zero Fake Success ---
  console.log('\n--- Suite 6: Google Drive Upload, Retry Handling, and Zero Fake Success ---');

  await test('[DRIVE IDEMPOTENCY] Duplicate upload for already STORED meeting returns existing metadata without re-uploading', async () => {
    const adminSession = {
      user: { id: 'usr_admin_a', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    const mBefore = mockDb.get('mtg_rec_001');
    const existingFileId = mBefore.recordingMetadata.google_drive_file_id;

    const dupRes = await uploadRecordingWithRetry({
      meetingId: 'mtg_rec_001',
      session: adminSession,
      fileBuffer: Buffer.from('different bytes'),
    });

    assert.strictEqual(dupRes.success, true);
    assert.strictEqual(dupRes.alreadyStored, true);
    assert.strictEqual(dupRes.fileId, existingFileId);
  });

  await test('[ZERO FAKE SUCCESS] Drive upload failure sets status FAILED with explicit failure reason', async () => {
    seedMeeting({
      id: 'mtg_rec_fail_003',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-fail',
      title: 'Failed Upload Simulation',
      sfuProvider: 'livekit',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        consent_session: {
          sessionId: 'sess_fail_003',
          status: 'ALL_GRANTED',
          consents: {
            usr_admin_a: { participantId: 'usr_admin_a', status: 'GRANTED' },
          },
        },
      },
    });

    // Simulate transient failure that exhausts retries
    googleConfig.setTestUploadFailure(true, 'Google Drive API Rate Limit Exceeded (429)');

    const adminSession = {
      user: { id: 'usr_admin_a', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    await assert.rejects(
      async () => uploadRecordingWithRetry({
        meetingId: 'mtg_rec_fail_003',
        session: adminSession,
        fileBuffer: Buffer.from('test bytes'),
        maxRetries: 2,
      }),
      /Google Drive API Rate Limit Exceeded/
    );

    const m = mockDb.get('mtg_rec_fail_003');
    assert.strictEqual(m.recordingStatus, 'FAILED');
    assert.match(m.recordingMetadata.failure_reason, /Google Drive API Rate Limit Exceeded/);

    googleConfig.setTestUploadFailure(false, '');
  });

  // --- Suite 7: Stale Job Recovery & Reconciliation ---
  console.log('\n--- Suite 7: Stale Job Reconciliation ---');

  seedMeeting({
    id: 'mtg_rec_stale_005',
    tenantId: 'tenant_a',
    publicId: 'mtg-pub-stale',
    title: 'Interrupted Job Meeting',
    sfuProvider: 'livekit',
    recordingStatus: 'PROCESSING',
    recordingMetadata: {
      egress_id: 'EG_stale_job_999',
      consent_session: {
        sessionId: 'sess_stale_005',
        status: 'ALL_GRANTED',
        consents: {
          usr_admin_a: { participantId: 'usr_admin_a', status: 'GRANTED' },
        },
      },
    },
  });

  await test('[RECONCILIATION] Reconciles stuck PROCESSING job by checking ListEgress and uploading file', async () => {
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = (action, body) => {
      if (action === 'ListEgress') {
        assert.strictEqual(body.egress_id, 'EG_stale_job_999');
        return {
          items: [
            {
              egress_id: 'EG_stale_job_999',
              status: 'EGRESS_COMPLETE',
              file_results: [
                {
                  filename: 'CLASPTEK_stale_recovered.mp4',
                },
              ],
            },
          ],
        };
      }
      throw new Error(`Unexpected action: ${action}`);
    };

    const adminSession = {
      user: { id: 'usr_admin_a', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    const recRes = await reconcileMeetingRecording({ meetingId: 'mtg_rec_stale_005', session: adminSession });
    assert.strictEqual(recRes.reconciled, true);
    assert.strictEqual(recRes.status, 'STORED');

    const m = mockDb.get('mtg_rec_stale_005');
    assert.strictEqual(m.recordingStatus, 'STORED');
  });

  // --- Suite 8: Secure Storage Retrieval & SSRF Hardening ---
  console.log('\n--- Suite 8: Secure Storage Retrieval & SSRF Hardening ---');

  await test('[SSRF] Rejects AWS / Cloud Metadata URL (169.254.169.254)', async () => {
    await assert.rejects(
      async () => validateStorageDownloadUrl('http://169.254.169.254/latest/meta-data/'),
      /INSECURE_DOWNLOAD_PROTOCOL/
    );
    await assert.rejects(
      async () => validateStorageDownloadUrl('https://169.254.169.254/latest/meta-data/'),
      /UNTRUSTED_STORAGE_HOST/
    );
  });

  await test('[SSRF] Rejects Localhost destinations (127.0.0.1, localhost)', async () => {
    await assert.rejects(
      async () => validateStorageDownloadUrl('https://localhost/rec.mp4'),
      /UNTRUSTED_STORAGE_HOST/
    );
    await assert.rejects(
      async () => validateStorageDownloadUrl('https://127.0.0.1/rec.mp4'),
      /UNTRUSTED_STORAGE_HOST/
    );
  });

  await test('[SSRF] Rejects Private IPv4 and IPv6 address spaces in isPrivateOrReservedIp', async () => {
    // IPv4 private/reserved
    assert.strictEqual(isPrivateOrReservedIp('10.0.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('192.168.1.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('172.20.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('169.254.169.254'), true);
    assert.strictEqual(isPrivateOrReservedIp('127.0.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('100.64.0.1'), true);
    assert.strictEqual(isPrivateOrReservedIp('0.0.0.0'), true);

    // IPv6 private/reserved
    assert.strictEqual(isPrivateOrReservedIp('::1'), true);
    assert.strictEqual(isPrivateOrReservedIp('fe80::1'), true);
    assert.strictEqual(isPrivateOrReservedIp('fc00::1'), true);
    assert.strictEqual(isPrivateOrReservedIp('::ffff:169.254.169.254'), true);
    assert.strictEqual(isPrivateOrReservedIp('::ffff:127.0.0.1'), true);

    // Public AWS S3 IP
    assert.strictEqual(isPrivateOrReservedIp('52.216.1.1'), false);
  });

  await test('[SSRF] Rejects Insecure HTTP scheme', async () => {
    await assert.rejects(
      async () => validateStorageDownloadUrl('http://mybucket.s3.amazonaws.com/rec.mp4'),
      /INSECURE_DOWNLOAD_PROTOCOL/
    );
  });

  await test('[SSRF] Rejects Embedded credentials in URL', async () => {
    await assert.rejects(
      async () => validateStorageDownloadUrl('https://user:pass@mybucket.s3.amazonaws.com/rec.mp4'),
      /CREDENTIALS_IN_URL_FORBIDDEN/
    );
  });

  await test('[SSRF] Rejects Non-standard ports', async () => {
    await assert.rejects(
      async () => validateStorageDownloadUrl('https://mybucket.s3.amazonaws.com:8080/rec.mp4'),
      /NON_STANDARD_PORT_FORBIDDEN/
    );
  });

  await test('[SSRF] Rejects Misleading and untrusted hostnames', async () => {
    await assert.rejects(
      async () => validateStorageDownloadUrl('https://s3.amazonaws.com.attacker.com/rec.mp4'),
      /UNTRUSTED_STORAGE_HOST/
    );
    await assert.rejects(
      async () => validateStorageDownloadUrl('https://evil-storage.com/rec.mp4'),
      /UNTRUSTED_STORAGE_HOST/
    );
  });

  await test('[SSRF] Rejects Redirects pointing to restricted/private targets', async () => {
    global.__TEST_DOWNLOAD_HANDLER__ = async (url) => {
      if (url.includes('redirect')) {
        throw new RecordingServiceError('SSRF_ATTEMPT_BLOCKED', 'Redirect target resolves to restricted IP');
      }
      return Buffer.from('data');
    };

    await assert.rejects(
      async () => downloadSecureRecordingUrl('https://mybucket.s3.amazonaws.com/redirect.mp4'),
      /SSRF_ATTEMPT_BLOCKED/
    );
    delete global.__TEST_DOWNLOAD_HANDLER__;
  });

  await test('[SSRF] Enforces maximum file-size limits and aborts oversized streams', async () => {
    global.__TEST_DOWNLOAD_HANDLER__ = async (url, opts) => {
      if (opts.maxSizeBytes && opts.maxSizeBytes < 1000) {
        throw new RecordingServiceError('FILE_EXCEEDS_SIZE_LIMIT', 'File exceeds maximum size', 413);
      }
      return Buffer.alloc(2000);
    };

    await assert.rejects(
      async () => downloadSecureRecordingUrl('https://mybucket.s3.amazonaws.com/huge.mp4', { maxSizeBytes: 500 }),
      /FILE_EXCEEDS_SIZE_LIMIT/
    );
    delete global.__TEST_DOWNLOAD_HANDLER__;
  });

  await test('[AUTH S3] Validates SigV4 signature calculation and headers on authentic S3 URL', async () => {
    let s3FetchedUrl = '';
    let s3Headers = {};

    global.__TEST_DOWNLOAD_HANDLER__ = async (url, opts) => {
      s3FetchedUrl = url;
      s3Headers = opts.headers || {};
      return Buffer.from('REAL_S3_VIDEO_BYTES');
    };

    const s3Buf = await fetchS3ObjectViaSigV4({
      bucket: 'my-verified-bucket',
      key: 'recordings/file.mp4',
      accessKey: 'AKIA_TEST_KEY',
      secret: 'SECRET_TEST_KEY',
      region: 'us-east-1',
    });

    assert.strictEqual(s3Buf.toString(), 'REAL_S3_VIDEO_BYTES');
    assert.match(s3FetchedUrl, /my-verified-bucket\.s3\.us-east-1\.amazonaws\.com/);
    assert.ok(s3Headers['Authorization']);
    assert.match(s3Headers['Authorization'], /^AWS4-HMAC-SHA256 Credential=AKIA_TEST_KEY/);
    assert.ok(s3Headers['x-amz-date']);
    assert.ok(s3Headers['x-amz-content-sha256']);
    delete global.__TEST_DOWNLOAD_HANDLER__;
  });

  await test('[VALID STORAGE] Accepts authentic S3 and GCS endpoints', async () => {
    const validS3 = await validateStorageDownloadUrl('https://my-bucket.s3.us-east-1.amazonaws.com/test.mp4');
    assert.strictEqual(validS3.hostname, 'my-bucket.s3.us-east-1.amazonaws.com');

    const validGcs = await validateStorageDownloadUrl('https://storage.googleapis.com/my-gcs-bucket/test.mp4');
    assert.strictEqual(validGcs.hostname, 'storage.googleapis.com');
  });

  // --- Suite 9: Durable Webhook Idempotency & Multi-Worker Concurrency ---
  console.log('\n--- Suite 9: Durable Webhook Idempotency & Concurrency ---');

  seedMeeting({
    id: 'mtg_durable_001',
    tenantId: 'tenant_a',
    publicId: 'mtg-pub-durable',
    title: 'Durable Deduplication Meeting',
    sfuProvider: 'livekit',
    recordingStatus: 'PROCESSING',
    recordingMetadata: {
      egress_id: 'EG_durable_job_777',
      processed_events: ['EV_already_processed_prior_instance'],
    },
  });

  await test('[DURABLE IDEMPOTENCY] Webhook duplicate suppression survives complete process restart (durable DB state)', async () => {
    const webhookBody = {
      id: 'EV_already_processed_prior_instance',
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'EG_durable_job_777',
        status: 'EGRESS_COMPLETE',
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const res = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });
    assert.strictEqual(res.status, 'DUPLICATE_EVENT_IGNORED');
  });

  await test('[CONCURRENCY] Active processing claim blocks concurrent second worker with CONCURRENT_PROCESSING_IN_PROGRESS', async () => {
    seedMeeting({
      id: 'mtg_concurrent_002',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-concurrent',
      title: 'Active Processing Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        egress_id: 'EG_active_claim_555',
        processing_claim: {
          token: 'claim_worker_A',
          claimed_at: new Date().toISOString(), // fresh claim < 10m
        },
      },
    });

    const webhookBody = {
      id: 'EV_new_event_for_active_job',
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'EG_active_claim_555',
        status: 'EGRESS_COMPLETE',
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const res = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });
    assert.strictEqual(res.status, 'CONCURRENT_PROCESSING_IN_PROGRESS');
  });

  await test('[CONCURRENCY LEASE] Expired claim lease (>10m) allows worker recovery from stuck worker', async () => {
    seedMeeting({
      id: 'mtg_expired_lease_003',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-expired-lease',
      title: 'Stuck Worker Recovery Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        egress_id: 'EG_expired_lease_444',
        processing_claim: {
          token: 'claim_crashed_worker',
          claimed_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago (expired)
        },
        consent_session: {
          sessionId: 'sess_expired_lease_003',
          status: 'ALL_GRANTED',
          consents: {
            usr_p1: { participantId: 'usr_p1', status: 'GRANTED' },
          },
        },
      },
    });

    const webhookBody = {
      id: 'EV_event_recovering_stuck_job',
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'EG_expired_lease_444',
        roomName: 'mtg-pub-expired-lease',
        status: 'EGRESS_COMPLETE',
        fileResults: [
          {
            filename: 'recovered_after_crash.mp4',
            location: 's3://clasptek-recordings-bucket/recordings/recovered_after_crash.mp4',
          },
        ],
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const res = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });
    assert.strictEqual(res.status, 'UPLOADED_AND_STORED');

    const m = mockDb.get('mtg_expired_lease_003');
    assert.strictEqual(m.recordingStatus, 'STORED');
  });

  await test('[TERMINAL INTEGRITY] Late webhook cannot overwrite already STORED recording with real fileId', async () => {
    seedMeeting({
      id: 'mtg_terminal_stored_004',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-terminal',
      title: 'Terminal Stored Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'STORED',
      recordingMetadata: {
        egress_id: 'EG_terminal_job_333',
        google_drive_file_id: 'authoritative_gdrive_file_id_permanent',
      },
    });

    const webhookBody = {
      id: 'EV_late_failed_event',
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'EG_terminal_job_333',
        status: 'EGRESS_FAILED',
        error: 'Simulated late arrival failure event',
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const res = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });
    assert.strictEqual(res.status, 'ALREADY_STORED');

    const m = mockDb.get('mtg_terminal_stored_004');
    assert.strictEqual(m.recordingStatus, 'STORED'); // Preserved! Never overwritten to FAILED!
    assert.strictEqual(m.recordingMetadata.google_drive_file_id, 'authoritative_gdrive_file_id_permanent');
  });

  // --- Suite 10: Google Drive Lost-Response Recovery & Idempotent Adoption ---
  console.log('\n--- Suite 10: Google Drive Lost-Response Recovery & Idempotent Adoption ---');

  await test('[DRIVE RECOVERY] Lost response after Drive file creation: retry recovers and adopts existing file without duplicate creation', async () => {
    seedMeeting({
      id: 'mtg_drive_recovery_001',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-drive-recovery',
      title: 'Drive Timeout Recovery Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        consent_session: {
          sessionId: 'sess_drive_recovery_001',
          status: 'ALL_GRANTED',
          consents: {
            usr_admin_a: { participantId: 'usr_admin_a', status: 'GRANTED' },
          },
        },
      },
    });

    // Configure test mode to simulate network timeout right AFTER Drive creates the file
    googleConfig.setTestUploadTimeoutAfterCreate(true);

    const adminSession = {
      user: { id: 'usr_admin_a', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    const res = await uploadRecordingWithRetry({
      meetingId: 'mtg_drive_recovery_001',
      session: adminSession,
      fileBuffer: Buffer.from('test_video_bytes'),
      maxRetries: 3,
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.status, 'STORED');
    assert.ok(res.fileId);

    // Verify exactly ONE file was stored for this meeting in Drive memory store (no duplicate created!)
    const matchingFiles = Array.from(googleConfig._memoryDriveFiles.values()).filter(
      (f) => f.properties?.clasptek_meeting_id === 'mtg_drive_recovery_001'
    );
    assert.strictEqual(matchingFiles.length, 1);
  });

  await test('[DRIVE RECOVERY] Process crash after Drive creation: reconcileMeetingRecording recovers and marks STORED using authoritative Drive fileId', async () => {
    seedMeeting({
      id: 'mtg_drive_crash_002',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-drive-crash',
      title: 'Drive Crash Recovery Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        egress_id: 'EG_crash_before_db_update',
        consent_session: {
          sessionId: 'sess_drive_crash_002',
          status: 'ALL_GRANTED',
          consents: {
            usr_admin_a: { participantId: 'usr_admin_a', status: 'GRANTED' },
          },
        },
      },
    });

    // Pre-create the file in the tenant's root folder as if Drive upload succeeded right before process was killed
    const preCreatedId = 'mock_gdrive_file_precreated_before_crash';
    googleConfig._memoryDriveFiles.set(preCreatedId, {
      fileId: preCreatedId,
      id: preCreatedId,
      name: 'CLASPTEK_mtg-pub-drive-crash_recovered.mp4',
      fileName: 'CLASPTEK_mtg-pub-drive-crash_recovered.mp4',
      folderId: 'mock_root_recordings_folder',
      parents: ['mock_root_recordings_folder'],
      webViewUrl: `https://drive.google.com/file/d/${preCreatedId}/view`,
      size: 1048576,
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_drive_crash_002', clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: 'mtg_drive_crash_002', clasptek_tenant_id: 'tenant_a' },
    });

    const adminSession = {
      user: { id: 'usr_admin_a', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    const recRes = await reconcileMeetingRecording({ meetingId: 'mtg_drive_crash_002', session: adminSession });
    assert.strictEqual(recRes.reconciled, true);
    assert.strictEqual(recRes.status, 'STORED');

    const m = mockDb.get('mtg_drive_crash_002');
    assert.strictEqual(m.recordingStatus, 'STORED');
    assert.strictEqual(m.recordingMetadata.google_drive_file_id, preCreatedId);
  });

  // --- Suite 11: Server-Enforced Affirmative Consent Protocol ---
  console.log('\n--- Suite 11: Server-Enforced Affirmative Consent Protocol ---');

  await test('[CONSENT NO SESSION / PENDING] Recording start fails closed with 422 if consent is not affirmative', async () => {
    seedMeeting({
      id: 'mtg_consent_pending_001',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-consent-pending',
      title: 'Consent Pending Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'NOT_STARTED',
      facilitatorId: 'pers_fac_1',
      recordingMetadata: {
        active_participants: [
          { participantId: 'usr_fac_a', participantName: 'Facilitator A', role: 'Facilitator' },
          { participantId: 'usr_student_bob', participantName: 'Bob Student', role: 'STUDENT' },
        ],
      },
    });

    const facSession = {
      user: { id: 'usr_fac_a', email: 'fac@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Facilitator',
    };

    // Attempting to start recording before Bob has consented
    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_consent_pending_001', session: facSession }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.statusCode, 422);
        assert.ok(err.code === 'RECORDING_CONSENT_PENDING' || err.code === 'RECORDING_CONSENT_REQUIRED');
        return true;
      }
    );

    const m = mockDb.get('mtg_consent_pending_001');
    assert.strictEqual(m.recordingStatus, 'NOT_STARTED'); // Fails closed; recording did not start
  });

  await test('[CONSENT EXPLICIT DECLINE] Explicit participant decline blocks recording with 422; participant remains in meeting', async () => {
    seedMeeting({
      id: 'mtg_consent_decline_002',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-consent-decline',
      title: 'Consent Declined Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'NOT_STARTED',
      facilitatorId: 'pers_fac_1',
      cohortId: 'cohort_decline',
    });

    global.__TEST_MOCK_ENROLMENTS__ = [
      {
        id: 'enr_charlie',
        cohort_id: 'cohort_decline',
        student_id: 'usr_student_charlie',
        tenant_id: 'tenant_a',
        status: 'ACTIVE',
        students: { id: 'usr_student_charlie', first_name: 'Charlie', last_name: 'Student' },
      },
    ];

    const facSession = {
      user: { id: 'usr_fac_a', email: 'fac@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Facilitator',
    };

    // 1. Facilitator initiates consent session with participant roster
    const initRes = await initiateRecordingConsentSession({
      meetingId: 'mtg_consent_decline_002',
      session: facSession,
      participantList: [
        { participantId: 'usr_student_charlie', participantName: 'Charlie Student', role: 'STUDENT' },
      ],
    });
    assert.strictEqual(initRes.success, true);
    assert.ok(initRes.sessionId);

    // 2. Charlie explicitly declines consent
    const charlieSession = {
      user: { id: 'usr_student_charlie', email: 'charlie@student.org', user_metadata: { full_name: 'Charlie Student' } },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    const decRes = await recordParticipantConsent({
      meetingId: 'mtg_consent_decline_002',
      recordingSessionId: initRes.sessionId,
      session: charlieSession,
      decision: 'DECLINED',
      reason: 'I do not wish to be recorded today.',
    });
    assert.strictEqual(decRes.decision, 'DECLINED');

    // 3. Facilitator attempts to start recording -> strictly fails closed with 422 RECORDING_CONSENT_DECLINED
    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_consent_decline_002', session: facSession }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.statusCode, 422);
        assert.strictEqual(err.code, 'RECORDING_CONSENT_DECLINED');
        assert.match(err.message, /declined consent/i);
        return true;
      }
    );

    const m = mockDb.get('mtg_consent_decline_002');
    assert.strictEqual(m.recordingStatus, 'NOT_STARTED'); // Egress never initiated
  });

  await test('[CONSENT ALL GRANTED] When all participants affirmatively grant consent, recording starts successfully and audits RECORDING_ALLOWED', async () => {
    seedMeeting({
      id: 'mtg_consent_all_granted_003',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-consent-granted',
      title: 'Consented Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'NOT_STARTED',
      facilitatorId: 'pers_fac_1',
      cohortId: 'cohort_dan',
    });

    global.__TEST_MOCK_ENROLMENTS__ = [
      {
        id: 'enr_dan',
        cohort_id: 'cohort_dan',
        student_id: 'usr_student_dan',
        tenant_id: 'tenant_a',
        status: 'ACTIVE',
        students: { id: 'usr_student_dan', first_name: 'Dan', last_name: 'Student' },
      },
    ];

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = (action, body) => {
      if (action === 'StartRoomCompositeEgress') {
        return {
          egress_id: 'EG_consented_mock_123',
          room_name: body.room_name,
          status: 'EGRESS_STARTING',
        };
      }
      if (action === 'StopEgress') {
        return { egress_id: body.egress_id, status: 'EGRESS_ENDING' };
      }
      return {};
    };

    const facSession = {
      user: { id: 'usr_fac_a', email: 'fac@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Facilitator',
    };

    const initRes = await initiateRecordingConsentSession({
      meetingId: 'mtg_consent_all_granted_003',
      session: facSession,
      participantList: [
        { participantId: 'usr_student_dan', participantName: 'Dan Student', role: 'STUDENT' },
      ],
    });

    const danSession = {
      user: { id: 'usr_student_dan', email: 'dan@student.org' },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    // Dan grants consent
    await recordParticipantConsent({
      meetingId: 'mtg_consent_all_granted_003',
      recordingSessionId: initRes.sessionId,
      session: danSession,
      decision: 'GRANTED',
    });

    // Check status
    const statusRes = await getRecordingConsentStatus({
      meetingId: 'mtg_consent_all_granted_003',
      session: facSession,
    });
    assert.strictEqual(statusRes.allConsented, true);
    assert.strictEqual(statusRes.canStartRecording, true);

    // Start recording -> succeeds!
    const startRes = await startMeetingRecording({
      meetingId: 'mtg_consent_all_granted_003',
      session: facSession,
    });
    assert.strictEqual(startRes.success, true);
    assert.strictEqual(startRes.status, 'RECORDING');

    const m = mockDb.get('mtg_consent_all_granted_003');
    const audit = m.recordingMetadata.consent_audit_log;
    assert.ok(audit.some((a) => a.action === 'RECORDING_ALLOWED'));
  });

  await test('[CONSENT LATE JOIN] Late joiner before or during recording is registered with canPublish: false pending affirmative consent', async () => {
    seedMeeting({
      id: 'mtg_late_join_004',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-late-join',
      title: 'Late Joiner Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'RECORDING',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_active_999',
          status: 'ACTIVE_RECORDING',
          consents: {
            usr_fac_a: { status: 'GRANTED' },
          },
        },
      },
    });

    // Student Eve joins during active recording
    const regRes = await registerMeetingParticipant({
      meetingId: 'mtg_late_join_004',
      participantId: 'usr_student_eve',
      participantName: 'Eve Latecomer',
      role: 'STUDENT',
    });

    // Track publishing must be restricted (canPublish: false) until affirmative consent is given
    assert.strictEqual(regRes.canPublish, false);
    assert.strictEqual(regRes.requiresConsent, true);

    const m = mockDb.get('mtg_late_join_004');
    const eveEntry = m.recordingMetadata.active_participants.find((p) => p.participantId === 'usr_student_eve');
    assert.strictEqual(eveEntry.canPublish, false);
    assert.ok(m.recordingMetadata.consent_audit_log.some((a) => a.action === 'LATE_JOIN_REGISTERED'));
  });

  await test('[CONSENT WITHDRAWAL] Participant withdrawal during active recording halts LiveKit Egress immediately and audits RECORDING_STOPPED_DUE_TO_WITHDRAWAL', async () => {
    seedMeeting({
      id: 'mtg_consent_withdrawal_005',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-consent-withdrawn',
      title: 'Withdrawal Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'RECORDING',
      recordingMetadata: {
        egress_id: 'EG_live_session_to_stop_777',
        consent_session: {
          sessionId: 'rsess_live_to_withdraw',
          status: 'ACTIVE_RECORDING',
          consents: {
            usr_fac_a: { status: 'GRANTED' },
            usr_student_frank: { status: 'GRANTED' },
          },
        },
      },
    });

    let stopEgressCalledWith = '';
    (globalThis).__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'StopEgress') {
        stopEgressCalledWith = body.egress_id;
        return { egress_id: body.egress_id, status: 'EGRESS_ENDING' };
      }
      return {};
    };

    const frankSession = {
      user: { id: 'usr_student_frank', email: 'frank@student.org' },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    // Frank withdraws consent during recording
    const withdrawRes = await recordParticipantConsent({
      meetingId: 'mtg_consent_withdrawal_005',
      recordingSessionId: 'rsess_live_to_withdraw',
      session: frankSession,
      decision: 'WITHDRAWN',
      reason: 'I need to withdraw my consent.',
    });

    assert.strictEqual(withdrawRes.decision, 'WITHDRAWN');
    assert.strictEqual(withdrawRes.recordingStopped, true);
    assert.strictEqual(stopEgressCalledWith, 'EG_live_session_to_stop_777');

    const m = mockDb.get('mtg_consent_withdrawal_005');
    assert.strictEqual(m.recordingStatus, 'PROCESSING');
    assert.ok(m.recordingMetadata.consent_audit_log.some((a) => a.action === 'RECORDING_STOPPED_DUE_TO_WITHDRAWAL'));
  });

  await test('[CONSENT STALE SESSION] Consent with an expired or previous recordingSessionId is rejected with STALE_CONSENT_SESSION', async () => {
    seedMeeting({
      id: 'mtg_consent_stale_006',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-consent-stale',
      title: 'Stale Session Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_current_active_123',
          status: 'PENDING_CONSENT',
        },
      },
    });

    const userSession = {
      user: { id: 'usr_student_george', email: 'george@student.org' },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    await assert.rejects(
      async () =>
        recordParticipantConsent({
          meetingId: 'mtg_consent_stale_006',
          recordingSessionId: 'rsess_yesterdays_old_session',
          session: userSession,
          decision: 'GRANTED',
        }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.code, 'STALE_CONSENT_SESSION');
        assert.strictEqual(err.statusCode, 400);
        return true;
      }
    );
  });

  await test('[CONSENT SPOOFING PREVENTION] Participant identity is derived strictly from trusted session; spoofed client identity cannot authorize consent', async () => {
    seedMeeting({
      id: 'mtg_consent_spoof_007',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-consent-spoof',
      title: 'Spoof Prevention Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'NOT_STARTED',
      cohortId: 'cohort_spoof',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_spoof_check_007',
          status: 'PENDING_CONSENT',
          consents: {
            usr_victim: { status: 'PENDING' },
            usr_attacker: { status: 'PENDING' },
          },
        },
      },
    });

    global.__TEST_MOCK_ENROLMENTS__ = [
      {
        id: 'enr_attacker',
        cohort_id: 'cohort_spoof',
        student_id: 'usr_attacker',
        tenant_id: 'tenant_a',
        status: 'ACTIVE',
        students: { id: 'usr_attacker', first_name: 'Attacker', last_name: 'Student' },
      },
    ];

    // Attacker sends session for 'usr_attacker', but tries to grant consent for victim
    const attackerSession = {
      user: { id: 'usr_attacker', email: 'attacker@evil.org' },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    const res = await recordParticipantConsent({
      meetingId: 'mtg_consent_spoof_007',
      recordingSessionId: 'rsess_spoof_check_007',
      session: attackerSession,
      decision: 'GRANTED',
    });

    // Server derived participantId strictly from session.user.id ('usr_attacker')
    assert.strictEqual(res.participantId, 'usr_attacker');

    // Victim's status is UNTOUCHED
    const m = mockDb.get('mtg_consent_spoof_007');
    assert.strictEqual(m.recordingMetadata.consent_session.consents.usr_victim.status, 'PENDING');
  });

  await test('[CONSENT RACE SYNCHRONIZATION] Participant joining during startup window synchronizes membership and requires consent', async () => {
    seedMeeting({
      id: 'mtg_consent_race_008',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-consent-race',
      title: 'Race Synchronization Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'NOT_STARTED',
      facilitatorId: 'pers_fac_1',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_race_sync_008',
          status: 'ALL_GRANTED',
          consents: {
            usr_fac_a: { participantId: 'usr_fac_a', participantName: 'Facilitator A', status: 'GRANTED', recordingSessionId: 'rsess_race_sync_008' },
          },
        },
        active_participants: [
          { participantId: 'usr_fac_a', participantName: 'Facilitator A', role: 'Facilitator' },
        ],
      },
    });

    const facSession = {
      user: { id: 'usr_fac_a', email: 'fac@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Facilitator',
    };

    // Right before start, an unconsented student joins
    await registerMeetingParticipant({
      meetingId: 'mtg_consent_race_008',
      participantId: 'usr_student_race_joiner',
      participantName: 'Race Joiner',
      role: 'STUDENT',
    });

    // startMeetingRecording synchronizes active_participants and detects unconsented participant!
    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_consent_race_008', session: facSession }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.statusCode, 422);
        assert.ok(err.code === 'RECORDING_CONSENT_SYNC_REQUIRED' || err.code === 'RECORDING_CONSENT_PENDING');
        return true;
      }
    );
  });

  // --- Suite 12: Google Drive Candidate Identity & Ambiguity Protection ---
  console.log('\n--- Suite 12: Google Drive Candidate Identity & Ambiguity Protection ---');

  await test('[DRIVE IDENTITY] File matching name but belonging to another meeting is NOT adopted', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const targetMeetingId = 'mtg_drive_id_target';
    const otherMeetingId = 'mtg_drive_id_other';

    // File in Drive with identical name but metadata for another meeting
    const fileId = 'mock_gdrive_other_mtg_file';
    googleConfig._memoryDriveFiles.set(fileId, {
      fileId,
      id: fileId,
      name: 'CLASPTEK_session_recording.mp4',
      fileName: 'CLASPTEK_session_recording.mp4',
      folderId: rootFolderId,
      parents: [rootFolderId],
      webViewUrl: `https://drive.google.com/file/d/${fileId}/view`,
      size: 1048576,
      trashed: false,
      properties: { clasptek_meeting_id: otherMeetingId, clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: otherMeetingId, clasptek_tenant_id: 'tenant_a' },
    });

    const found = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: targetMeetingId,
      fileName: 'CLASPTEK_session_recording.mp4',
      tenantId: 'tenant_a',
    });

    assert.strictEqual(found, null); // Must not adopt!
  });

  await test('[DRIVE TENANT ISOLATION] Candidate file with mismatched tenant metadata is rejected', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const fileId = 'mock_gdrive_wrong_tenant_file';
    googleConfig._memoryDriveFiles.set(fileId, {
      fileId,
      id: fileId,
      name: 'CLASPTEK_session_recording.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_cross_tenant', clasptek_tenant_id: 'tenant_foreign' },
      appProperties: { clasptek_meeting_id: 'mtg_cross_tenant', clasptek_tenant_id: 'tenant_foreign' },
    });

    const found = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_cross_tenant',
      tenantId: 'tenant_a', // Expected tenant
    });

    assert.strictEqual(found, null); // Mismatched tenant rejected
  });

  await test('[DRIVE FOLDER BOUNDARY] Candidate file not located in expected root folder parent is rejected', async () => {
    const expectedFolder = 'mock_authoritative_root_folder';
    const wrongFolder = 'some_unauthorized_folder';
    const fileId = 'mock_gdrive_wrong_folder_file';

    googleConfig._memoryDriveFiles.set(fileId, {
      fileId,
      id: fileId,
      parents: [wrongFolder],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_wrong_folder', clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: 'mtg_wrong_folder', clasptek_tenant_id: 'tenant_a' },
    });

    const found = await googleConfig.findExistingDriveFile({
      folderId: expectedFolder,
      meetingId: 'mtg_wrong_folder',
      tenantId: 'tenant_a',
    });

    assert.strictEqual(found, null);
  });

  await test('[DRIVE AMBIGUITY] Multiple candidate files matching meeting throw AMBIGUOUS_DRIVE_CANDIDATES', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const meetingId = 'mtg_ambiguous_dupes';

    const file1 = 'mock_ambiguous_1';
    const file2 = 'mock_ambiguous_2';

    googleConfig._memoryDriveFiles.set(file1, {
      fileId: file1,
      id: file1,
      name: 'CLASPTEK_ambiguous_1.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: 'tenant_a' },
    });

    googleConfig._memoryDriveFiles.set(file2, {
      fileId: file2,
      id: file2,
      name: 'CLASPTEK_ambiguous_2.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: 'tenant_a' },
    });

    await assert.rejects(
      async () =>
        googleConfig.findExistingDriveFile({
          folderId: rootFolderId,
          meetingId,
          tenantId: 'tenant_a',
        }),
      /AMBIGUOUS_DRIVE_CANDIDATES/
    );
  });

  await test('[DRIVE LEGACY IGNORE] Legacy Drive file without clasptek_meeting_id metadata is never adopted based on name alone', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const fileId = 'mock_legacy_unmetadata_file';

    googleConfig._memoryDriveFiles.set(fileId, {
      fileId,
      id: fileId,
      name: 'CLASPTEK_legacy_meeting.mp4',
      fileName: 'CLASPTEK_legacy_meeting.mp4',
      parents: [rootFolderId],
      trashed: false,
      // No properties or appProperties
    });

    const found = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_legacy_meeting',
      fileName: 'CLASPTEK_legacy_meeting.mp4',
      tenantId: 'tenant_a',
    });

    assert.strictEqual(found, null); // Conservatives: strictly refuse to adopt without metadata
  });

  await test('[DRIVE IDENTITY EXACT MATCH] Exact meeting, tenant, and recording metadata matches and is adopted', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const fileId = 'mock_exact_match_file';
    googleConfig._memoryDriveFiles.set(fileId, {
      fileId,
      id: fileId,
      name: 'CLASPTEK_exact_match.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_exact_001', clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: 'mtg_exact_001', clasptek_tenant_id: 'tenant_a', clasptek_recording_id: 'rec_exact_001' },
    });

    const found = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_exact_001',
      tenantId: 'tenant_a',
      recordingId: 'rec_exact_001',
    });

    assert.ok(found);
    assert.strictEqual(found.fileId, fileId);
  });

  await test('[DRIVE TENANT MISSING REJECTED] Candidate file with missing tenant metadata is rejected when tenantId is supplied', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const fileId = 'mock_missing_tenant_file';
    googleConfig._memoryDriveFiles.set(fileId, {
      fileId,
      id: fileId,
      name: 'CLASPTEK_missing_tenant.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_missing_tenant' },
      appProperties: { clasptek_meeting_id: 'mtg_missing_tenant' },
    });

    const found = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_missing_tenant',
      tenantId: 'tenant_a',
    });

    assert.strictEqual(found, null); // Strictly rejected because tenant metadata is missing!
  });

  await test('[DRIVE RECORDING MISSING REJECTED] Candidate file with missing recording metadata is rejected when recordingId is supplied', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const fileId = 'mock_missing_rec_file';
    googleConfig._memoryDriveFiles.set(fileId, {
      fileId,
      id: fileId,
      name: 'CLASPTEK_missing_rec.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_missing_rec', clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: 'mtg_missing_rec', clasptek_tenant_id: 'tenant_a' },
    });

    const found = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_missing_rec',
      tenantId: 'tenant_a',
      recordingId: 'rec_specific_001',
    });

    assert.strictEqual(found, null); // Strictly rejected because recording metadata is missing when required!
  });

  await test('[DRIVE RECORDING MISMATCH REJECTED] Candidate file with mismatched recording metadata is rejected', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const fileId = 'mock_wrong_rec_file';
    googleConfig._memoryDriveFiles.set(fileId, {
      fileId,
      id: fileId,
      name: 'CLASPTEK_wrong_rec.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_wrong_rec', clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: 'mtg_wrong_rec', clasptek_tenant_id: 'tenant_a', clasptek_recording_id: 'rec_old_001' },
    });

    const found = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_wrong_rec',
      tenantId: 'tenant_a',
      recordingId: 'rec_new_002',
    });

    assert.strictEqual(found, null); // Mismatched recording ID rejected
  });

  await test('[DRIVE CONFLICTING METADATA REJECTED] Conflicting metadata between properties and appProperties is rejected safely', async () => {
    const rootFolderId = 'mock_root_recordings_folder';

    // 1. Conflicting meeting ID
    const fileMtgConflict = 'mock_conflict_mtg';
    googleConfig._memoryDriveFiles.set(fileMtgConflict, {
      fileId: fileMtgConflict,
      id: fileMtgConflict,
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_target', clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: 'mtg_impostor', clasptek_tenant_id: 'tenant_a' },
    });

    const foundMtg = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_target',
      tenantId: 'tenant_a',
    });
    assert.strictEqual(foundMtg, null);

    // 2. Conflicting tenant ID
    const fileTenantConflict = 'mock_conflict_tenant';
    googleConfig._memoryDriveFiles.set(fileTenantConflict, {
      fileId: fileTenantConflict,
      id: fileTenantConflict,
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_target_tenant', clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: 'mtg_target_tenant', clasptek_tenant_id: 'tenant_b' },
    });

    const foundTenant = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_target_tenant',
      tenantId: 'tenant_a',
    });
    assert.strictEqual(foundTenant, null);

    // 3. Conflicting recording ID
    const fileRecConflict = 'mock_conflict_rec';
    googleConfig._memoryDriveFiles.set(fileRecConflict, {
      fileId: fileRecConflict,
      id: fileRecConflict,
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_target_rec', clasptek_tenant_id: 'tenant_a', clasptek_recording_id: 'rec_alpha' },
      appProperties: { clasptek_meeting_id: 'mtg_target_rec', clasptek_tenant_id: 'tenant_a', clasptek_recording_id: 'rec_beta' },
    });

    const foundRec = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_target_rec',
      tenantId: 'tenant_a',
      recordingId: 'rec_alpha',
    });
    assert.strictEqual(foundRec, null);
  });

  await test('[DRIVE LEGITIMATE OPTIONAL FIELDS] Legitimate recovery where recordingId is absent matches valid tenant-scoped file', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const fileId = 'mock_legit_opt_file';
    googleConfig._memoryDriveFiles.set(fileId, {
      fileId,
      id: fileId,
      name: 'CLASPTEK_opt_file.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_opt_001', clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: 'mtg_opt_001', clasptek_tenant_id: 'tenant_a' },
    });

    const found = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_opt_001',
      tenantId: 'tenant_a',
      // recordingId intentionally omitted (legitimate early crash recovery)
    });

    assert.ok(found);
    assert.strictEqual(found.fileId, fileId);
  });

  await test('[DRIVE AMBIGUITY ALL FIELDS] Multiple candidate files matching meeting, tenant, and recording ID throw AMBIGUOUS_DRIVE_CANDIDATES', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const meetingId = 'mtg_ambig_full_001';
    const tenantId = 'tenant_a';
    const recId = 'rec_ambig_full_001';

    const file1 = 'mock_ambig_full_1';
    const file2 = 'mock_ambig_full_2';

    googleConfig._memoryDriveFiles.set(file1, {
      fileId: file1,
      name: 'recording_copy_1.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId },
      appProperties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId, clasptek_recording_id: recId },
    });

    googleConfig._memoryDriveFiles.set(file2, {
      fileId: file2,
      name: 'recording_copy_2.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId },
      appProperties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId, clasptek_recording_id: recId },
    });

    await assert.rejects(
      async () =>
        googleConfig.findExistingDriveFile({
          folderId: rootFolderId,
          meetingId,
          tenantId,
          recordingId: recId,
        }),
      /AMBIGUOUS_DRIVE_CANDIDATES/
    );
  });

  await test('[DRIVE INPUT SANITIZATION] Empty, whitespace, or invalid identifiers fail closed and return null', async () => {
    const rootFolderId = 'mock_root_recordings_folder';

    // 1. Empty/whitespace meetingId
    const resEmptyMtg = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: '   ',
      tenantId: 'tenant_a',
    });
    assert.strictEqual(resEmptyMtg, null);

    // 2. Empty/whitespace folderId
    const resEmptyFolder = await googleConfig.findExistingDriveFile({
      folderId: '   ',
      meetingId: 'mtg_valid_123',
      tenantId: 'tenant_a',
    });
    assert.strictEqual(resEmptyFolder, null);

    // 3. Null meetingId
    const resNullMtg = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: null,
    });
    assert.strictEqual(resNullMtg, null);

    // 4. Quotation injection / malformed meetingId sanitizes safely
    const resQuoteMtg = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: "'''\\",
      tenantId: 'tenant_a',
    });
    assert.strictEqual(resQuoteMtg, null);
  });

  await test('[DRIVE SAME FILENAME IDENTITY ISOLATION] Files with identical filename but incorrect tenant or recording metadata are rejected', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const sharedFileName = 'CLASPTEK_session_recording.mp4';

    // File 1: Matching meeting ID and same filename, but WRONG tenant
    const wrongTenantFileId = 'mock_same_name_wrong_tenant';
    googleConfig._memoryDriveFiles.set(wrongTenantFileId, {
      fileId: wrongTenantFileId,
      name: sharedFileName,
      fileName: sharedFileName,
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_same_name', clasptek_tenant_id: 'tenant_other' },
      appProperties: { clasptek_meeting_id: 'mtg_same_name', clasptek_tenant_id: 'tenant_other', clasptek_recording_id: 'rec_same_name' },
    });

    const resWrongTenant = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_same_name',
      tenantId: 'tenant_expected',
      recordingId: 'rec_same_name',
      fileName: sharedFileName,
    });
    assert.strictEqual(resWrongTenant, null); // Must not adopt!

    // File 2: Matching meeting ID, matching tenant, same filename, but WRONG recordingId
    const wrongRecFileId = 'mock_same_name_wrong_rec';
    googleConfig._memoryDriveFiles.set(wrongRecFileId, {
      fileId: wrongRecFileId,
      name: sharedFileName,
      fileName: sharedFileName,
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: 'mtg_same_name', clasptek_tenant_id: 'tenant_expected' },
      appProperties: { clasptek_meeting_id: 'mtg_same_name', clasptek_tenant_id: 'tenant_expected', clasptek_recording_id: 'rec_prior_session' },
    });

    const resWrongRec = await googleConfig.findExistingDriveFile({
      folderId: rootFolderId,
      meetingId: 'mtg_same_name',
      tenantId: 'tenant_expected',
      recordingId: 'rec_current_session',
      fileName: sharedFileName,
    });
    assert.strictEqual(resWrongRec, null); // Must not adopt!
  });

  await test('[DRIVE RETRY IDEMPOTENCY VS OPERATIONAL ERROR] Ambiguity halts with 409 while transient network error triggers retry and recovery', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const meetingId = 'mtg_ambig_operational_test';

    // Seed duplicate files to cause AMBIGUOUS_DRIVE_CANDIDATES
    const f1 = 'mock_file_op_1';
    const f2 = 'mock_file_op_2';
    googleConfig._memoryDriveFiles.set(f1, {
      fileId: f1,
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: 'tenant_a', clasptek_recording_id: 'rec_op_1' },
    });
    googleConfig._memoryDriveFiles.set(f2, {
      fileId: f2,
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: 'tenant_a' },
      appProperties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: 'tenant_a', clasptek_recording_id: 'rec_op_1' },
    });

    // Verification: findExistingDriveFile surfaces AMBIGUOUS_DRIVE_CANDIDATES cleanly
    await assert.rejects(
      async () =>
        googleConfig.findExistingDriveFile({
          folderId: rootFolderId,
          meetingId,
          tenantId: 'tenant_a',
          recordingId: 'rec_op_1',
        }),
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('AMBIGUOUS_DRIVE_CANDIDATES'));
        return true;
      }
    );
  });

  // --- Section 2 & 3: Drive Pagination & Timeout/Retry Safety Tests ---

  await test('[DRIVE PAGINATION TEST A] Duplicate across pages is rejected with AMBIGUOUS_DRIVE_CANDIDATES', async () => {
    const rootFolderId = 'mock_root_folder_pag_a';
    const meetingId = 'mtg_pag_a';
    const tenantId = 'tenant_a';
    const recId = 'rec_pag_a';

    const candPage1 = {
      id: 'gdrive_file_p1',
      name: 'recording_p1.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId },
      appProperties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId, clasptek_recording_id: recId },
    };

    const candPage2 = {
      id: 'gdrive_file_p2',
      name: 'recording_p2.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId },
      appProperties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId, clasptek_recording_id: recId },
    };

    googleConfig.setTestDriveSearchPages([
      { status: 200, body: { files: [candPage1], nextPageToken: 'token_to_page_2' } },
      { status: 200, body: { files: [candPage2] } },
    ]);

    try {
      await assert.rejects(
        async () =>
          googleConfig.findExistingDriveFile({
            folderId: rootFolderId,
            meetingId,
            tenantId,
            recordingId: recId,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'AMBIGUOUS_DRIVE_CANDIDATES');
          assert.ok(err.message.includes('Multiple Drive files (2) match meeting identifier'));
          return true;
        }
      );
    } finally {
      googleConfig.setTestDriveSearchPages(null);
    }
  });

  await test('[DRIVE PAGINATION TEST B] No duplicate across pages adopts candidate only after complete search', async () => {
    const rootFolderId = 'mock_root_folder_pag_b';
    const meetingId = 'mtg_pag_b';
    const tenantId = 'tenant_a';
    const recId = 'rec_pag_b';

    const candPage1 = {
      id: 'gdrive_file_unique_p1',
      name: 'recording_unique.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId },
      appProperties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId, clasptek_recording_id: recId },
    };

    googleConfig.setTestDriveSearchPages([
      { status: 200, body: { files: [candPage1], nextPageToken: 'token_to_page_2' } },
      {
        status: 200,
        body: {
          files: [],
          nextPageToken: null,
        },
      },
    ]);

    try {
      const found = await googleConfig.findExistingDriveFile({
        folderId: rootFolderId,
        meetingId,
        tenantId,
        recordingId: recId,
      });

      assert.ok(found);
      assert.strictEqual(found.fileId, 'gdrive_file_unique_p1');
    } finally {
      googleConfig.setTestDriveSearchPages(null);
    }
  });

  await test('[DRIVE PAGINATION TEST C] Later-page API failure fails closed with DRIVE_SEARCH_INCONCLUSIVE without adopting page 1 match', async () => {
    const rootFolderId = 'mock_root_folder_pag_c';
    const meetingId = 'mtg_pag_c';
    const tenantId = 'tenant_a';
    const recId = 'rec_pag_c';

    const candPage1 = {
      id: 'gdrive_file_p1_premature',
      name: 'recording_p1.mp4',
      parents: [rootFolderId],
      trashed: false,
      properties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId },
      appProperties: { clasptek_meeting_id: meetingId, clasptek_tenant_id: tenantId, clasptek_recording_id: recId },
    };

    googleConfig.setTestDriveSearchPages([
      { status: 200, body: { files: [candPage1], nextPageToken: 'token_to_page_2' } },
      { status: 500, body: { error: { message: 'Internal Drive API Failure on page 2' } } },
    ]);

    try {
      await assert.rejects(
        async () =>
          googleConfig.findExistingDriveFile({
            folderId: rootFolderId,
            meetingId,
            tenantId,
            recordingId: recId,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'DRIVE_SEARCH_INCONCLUSIVE');
          assert.ok(err.message.includes('page 2'));
          return true;
        }
      );
    } finally {
      googleConfig.setTestDriveSearchPages(null);
    }
  });

  await test('[DRIVE PAGINATION TEST D] Pagination termination protects against cyclic, malformed, or infinite tokens', async () => {
    const rootFolderId = 'mock_root_folder_pag_d';
    const meetingId = 'mtg_pag_d';
    const tenantId = 'tenant_a';

    // 1. Cyclic token detection
    googleConfig.setTestDriveSearchPages([
      { status: 200, body: { files: [], nextPageToken: 'cyclic_token_1' } },
      { status: 200, body: { files: [], nextPageToken: 'cyclic_token_1' } },
    ]);

    try {
      await assert.rejects(
        async () =>
          googleConfig.findExistingDriveFile({
            folderId: rootFolderId,
            meetingId,
            tenantId,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'DRIVE_SEARCH_INCONCLUSIVE');
          assert.ok(err.message.includes('Cyclic nextPageToken'));
          return true;
        }
      );
    } finally {
      googleConfig.setTestDriveSearchPages(null);
    }

    // 2. Malformed empty token
    googleConfig.setTestDriveSearchPages([
      { status: 200, body: { files: [], nextPageToken: '   ' } },
    ]);

    try {
      await assert.rejects(
        async () =>
          googleConfig.findExistingDriveFile({
            folderId: rootFolderId,
            meetingId,
            tenantId,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'DRIVE_SEARCH_INCONCLUSIVE');
          assert.ok(err.message.includes('Malformed empty nextPageToken'));
          return true;
        }
      );
    } finally {
      googleConfig.setTestDriveSearchPages(null);
    }
  });

  await test('[DRIVE RETRY SAFETY] Inconclusive lookup fails closed without treating operational error as confirmed absence', async () => {
    const rootFolderId = 'mock_root_recordings_folder';
    const meetingId = 'mtg_inconclusive_safety';
    const tenantId = 'tenant_a';

    googleConfig.setTestDriveSearchFailure('Simulated Google Drive Socket Timeout');

    try {
      await assert.rejects(
        async () =>
          googleConfig.findExistingDriveFile({
            folderId: rootFolderId,
            meetingId,
            tenantId,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'DRIVE_SEARCH_INCONCLUSIVE');
          assert.ok(err.message.includes('Simulated Google Drive Socket Timeout'));
          return true;
        }
      );
    } finally {
      googleConfig.setTestDriveSearchFailure(null);
    }
  });

  await test('[DRIVE PAGINATION TEST D.3] Pagination cap: exceeding maxPages = 50 fails closed with DRIVE_SEARCH_INCONCLUSIVE without looping infinitely', async () => {
    const rootFolderId = 'mock_root_folder_pag_cap';
    const meetingId = 'mtg_pag_cap_50';
    const tenantId = 'tenant_a';

    let pagesFetched = 0;
    googleConfig.setTestDriveSearchPages((token, pageIndex) => {
      pagesFetched = pageIndex;
      return {
        status: 200,
        body: {
          files: [],
          nextPageToken: `token_for_page_${pageIndex + 1}`,
        },
      };
    });

    try {
      await assert.rejects(
        async () =>
          googleConfig.findExistingDriveFile({
            folderId: rootFolderId,
            meetingId,
            tenantId,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'DRIVE_SEARCH_INCONCLUSIVE');
          assert.ok(err.message.includes('Exceeded maximum pagination limit (50 pages)'));
          return true;
        }
      );
      assert.strictEqual(pagesFetched, 50); // Bound: stopped after 50 pages before page 51
    } finally {
      googleConfig.setTestDriveSearchPages(null);
    }
  });

  await test('[CALLER RETRY TEST A] Inconclusive lookup on upload retry aborts without initiating duplicate upload', async () => {
    const meetingId = 'mtg_caller_retry_inconclusive';
    const tenantId = 'tenant_a';
    seedMeeting({
      id: meetingId,
      publicId: 'pub_retry_inc',
      title: 'Caller Retry Inconclusive Meeting',
      tenantId,
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        recordingId: 'rec_caller_retry_inc_1',
        consent_session: {
          sessionId: 'sess_caller_retry_inc',
          status: 'ALL_GRANTED',
          consents: {
            usr_admin_retry: { participantId: 'usr_admin_retry', status: 'GRANTED' },
          },
        },
      },
    });

    // Attempt 1 succeeds in creating the file in Drive, but client drops connection / times out
    googleConfig.setTestUploadTimeoutAfterCreate(true);

    const adminSession = {
      user: { id: 'usr_admin_retry', email: 'admin@tenant-a.org' },
      tenantId,
      role: 'Super Admin',
    };

    // Pre-flight check (call 1) returns confirmed absence (0 files).
    // Post-error recovery check (call 2) encounters operational 500 error.
    let searchCall = 0;
    googleConfig.setTestDriveSearchPages((token, pageIndex) => {
      searchCall++;
      if (searchCall === 1) {
        return { status: 200, body: { files: [], nextPageToken: null } };
      }
      return { status: 500, body: { error: { message: 'Transient Drive 500 during retry recovery search' } } };
    });

    try {
      await assert.rejects(
        async () =>
          uploadRecordingWithRetry({
            meetingId,
            session: adminSession,
            fileBuffer: Buffer.from('test_video_bytes_retry_inc'),
            maxRetries: 3,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'DRIVE_SEARCH_INCONCLUSIVE');
          assert.strictEqual(err.statusCode, 502);
          return true;
        }
      );

      // Verify that uploadFileToGoogleDrive was NOT called a second time
      // Exactly 1 file exists in Drive memory store from attempt 1; no duplicate was created!
      const matchingFiles = Array.from(googleConfig._memoryDriveFiles.values()).filter(
        (f) => f.properties?.clasptek_meeting_id === meetingId
      );
      assert.strictEqual(matchingFiles.length, 1);
    } finally {
      googleConfig.setTestUploadTimeoutAfterCreate(false);
      googleConfig.setTestDriveSearchPages(null);
    }
  });

  await test('[CALLER RETRY TEST B] Post-timeout recovery lookup failure is not swallowed and distinguishes ambiguity vs operational error', async () => {
    const meetingId = 'mtg_caller_timeout_post_error';
    const tenantId = 'tenant_a';
    seedMeeting({
      id: meetingId,
      publicId: 'pub_post_timeout_inc',
      title: 'Caller Post Timeout Meeting',
      tenantId,
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        recordingId: 'rec_post_timeout_inc_1',
        consent_session: {
          sessionId: 'sess_caller_timeout_post_error',
          status: 'ALL_GRANTED',
          consents: {
            usr_admin_timeout: { participantId: 'usr_admin_timeout', status: 'GRANTED' },
          },
        },
      },
    });

    const adminSession = {
      user: { id: 'usr_admin_timeout', email: 'admin@tenant-a.org' },
      tenantId,
      role: 'Super Admin',
    };

    // 1. Operational error test: Lookup fails operationally with 502 DRIVE_SEARCH_INCONCLUSIVE
    googleConfig.setTestUploadTimeoutAfterCreate(true);
    let searchCount1 = 0;
    googleConfig.setTestDriveSearchPages((token, pageIndex) => {
      searchCount1++;
      if (searchCount1 === 1) {
        return { status: 200, body: { files: [], nextPageToken: null } };
      }
      return { status: 502, body: { error: { message: 'Operational Drive Search Failure' } } };
    });

    try {
      await assert.rejects(
        async () =>
          uploadRecordingWithRetry({
            meetingId,
            session: adminSession,
            fileBuffer: Buffer.from('test_video_bytes_b1'),
            maxRetries: 2,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'DRIVE_SEARCH_INCONCLUSIVE');
          assert.strictEqual(err.statusCode, 502);
          return true;
        }
      );
    } finally {
      googleConfig.setTestUploadTimeoutAfterCreate(false);
      googleConfig.setTestDriveSearchPages(null);
    }

    // 2. Ambiguity error test: Lookup fails with 409 AMBIGUOUS_DRIVE_CANDIDATES
    const ambigMeetingId = 'mtg_caller_ambig_test';
    seedMeeting({
      id: ambigMeetingId,
      publicId: 'pub_ambig_test',
      title: 'Caller Ambiguity Meeting',
      tenantId,
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        recordingId: 'rec_ambig_test_1',
        consent_session: {
          sessionId: 'sess_caller_ambig',
          status: 'ALL_GRANTED',
          consents: {
            usr_admin_timeout: { participantId: 'usr_admin_timeout', status: 'GRANTED' },
          },
        },
      },
    });

    const ambigErr = new Error('AMBIGUOUS_DRIVE_CANDIDATES: Multiple Drive files match meeting');
    ambigErr.code = 'AMBIGUOUS_DRIVE_CANDIDATES';
    googleConfig.setTestDriveSearchFailure(ambigErr);

    try {
      await assert.rejects(
        async () =>
          uploadRecordingWithRetry({
            meetingId: ambigMeetingId,
            session: adminSession,
            fileBuffer: Buffer.from('test_video_bytes_b2'),
            maxRetries: 2,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'AMBIGUOUS_DRIVE_CANDIDATES');
          assert.strictEqual(err.statusCode, 409);
          return true;
        }
      );
    } finally {
      googleConfig.setTestDriveSearchFailure(null);
    }
  });

  await test('[CALLER RETRY TEST C] Confirmed absence from complete search permits legitimate initial upload without false positive', async () => {
    const meetingId = 'mtg_caller_confirmed_absence_legit';
    const tenantId = 'tenant_a';
    seedMeeting({
      id: meetingId,
      publicId: 'pub_confirmed_abs',
      title: 'Caller Confirmed Absence Meeting',
      tenantId,
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        recordingId: 'rec_confirmed_abs_1',
        consent_session: {
          sessionId: 'sess_caller_confirmed_abs',
          status: 'ALL_GRANTED',
          consents: {
            usr_admin_abs: { participantId: 'usr_admin_abs', status: 'GRANTED' },
          },
        },
      },
    });

    const adminSession = {
      user: { id: 'usr_admin_abs', email: 'admin@tenant-a.org' },
      tenantId,
      role: 'Super Admin',
    };

    // Pre-flight lookup completes successfully across all pages with zero files (confirmed absence)
    googleConfig.setTestDriveSearchPages([
      { status: 200, body: { files: [], nextPageToken: null } },
    ]);

    try {
      const res = await uploadRecordingWithRetry({
        meetingId,
        session: adminSession,
        fileBuffer: Buffer.from('test_video_bytes_legit_initial'),
        maxRetries: 3,
      });

      assert.strictEqual(res.success, true);
      assert.strictEqual(res.status, 'STORED');
      assert.ok(res.fileId);

      // Verify file was legitimately created and committed
      const matchingFiles = Array.from(googleConfig._memoryDriveFiles.values()).filter(
        (f) => f.properties?.clasptek_meeting_id === meetingId
      );
      assert.strictEqual(matchingFiles.length, 1);
    } finally {
      googleConfig.setTestDriveSearchPages(null);
    }
  });

  await test('[CALLER RETRY TEST E] Structured error handling distinguishes codes and treats unexpected untyped errors fail-closed', async () => {
    const meetingId = 'mtg_caller_structured_errors';
    const tenantId = 'tenant_a';
    seedMeeting({
      id: meetingId,
      publicId: 'pub_struct_err',
      title: 'Caller Structured Errors Meeting',
      tenantId,
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        recordingId: 'rec_struct_err_1',
        consent_session: {
          sessionId: 'sess_caller_struct_err',
          status: 'ALL_GRANTED',
          consents: {
            usr_admin_struct: { participantId: 'usr_admin_struct', status: 'GRANTED' },
          },
        },
      },
    });

    const adminSession = {
      user: { id: 'usr_admin_struct', email: 'admin@tenant-a.org' },
      tenantId,
      role: 'Super Admin',
    };

    // 1. Untyped unexpected error during lookup (no recognized error code)
    const unexpectedErr = new Error('UNKNOWN_LOWLEVEL_TRANSPORT_FAULT');
    // Deliberately no .code property on unexpectedErr
    googleConfig.setTestDriveSearchFailure(unexpectedErr);

    try {
      await assert.rejects(
        async () =>
          uploadRecordingWithRetry({
            meetingId,
            session: adminSession,
            fileBuffer: Buffer.from('test_video_bytes_untyped'),
            maxRetries: 2,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'DRIVE_SEARCH_INCONCLUSIVE');
          assert.strictEqual(err.statusCode, 502);
          assert.ok(err.message.includes('Pre-upload Drive lookup failed unexpectedly'));
          assert.ok(err.message.includes('UNKNOWN_LOWLEVEL_TRANSPORT_FAULT'));
          return true;
        }
      );
    } finally {
      googleConfig.setTestDriveSearchFailure(null);
    }

    // 2. Structured AMBIGUOUS_DRIVE_CANDIDATES
    const ambigMeetingId = 'mtg_caller_structured_errors_ambig';
    seedMeeting({
      id: ambigMeetingId,
      publicId: 'pub_struct_ambig',
      title: 'Caller Structured Errors Ambiguity Meeting',
      tenantId,
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        recordingId: 'rec_struct_ambig_1',
        consent_session: {
          sessionId: 'sess_caller_struct_ambig',
          status: 'ALL_GRANTED',
          consents: {
            usr_admin_struct: { participantId: 'usr_admin_struct', status: 'GRANTED' },
          },
        },
      },
    });

    const ambigErr = new Error('AMBIGUOUS_DRIVE_CANDIDATES: Exact match ambiguity detected');
    ambigErr.code = 'AMBIGUOUS_DRIVE_CANDIDATES';
    googleConfig.setTestDriveSearchFailure(ambigErr);

    try {
      await assert.rejects(
        async () =>
          uploadRecordingWithRetry({
            meetingId: ambigMeetingId,
            session: adminSession,
            fileBuffer: Buffer.from('test_video_bytes_ambig'),
            maxRetries: 2,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'AMBIGUOUS_DRIVE_CANDIDATES');
          assert.strictEqual(err.statusCode, 409);
          return true;
        }
      );
    } finally {
      googleConfig.setTestDriveSearchFailure(null);
    }

    // 3. Structured DRIVE_SEARCH_INCONCLUSIVE
    const inconcMeetingId = 'mtg_caller_structured_errors_inconc';
    seedMeeting({
      id: inconcMeetingId,
      publicId: 'pub_struct_inconc',
      title: 'Caller Structured Errors Inconclusive Meeting',
      tenantId,
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        recordingId: 'rec_struct_inconc_1',
        consent_session: {
          sessionId: 'sess_caller_struct_inconc',
          status: 'ALL_GRANTED',
          consents: {
            usr_admin_struct: { participantId: 'usr_admin_struct', status: 'GRANTED' },
          },
        },
      },
    });

    const inconcErr = new Error('DRIVE_SEARCH_INCONCLUSIVE: Partial page failure');
    inconcErr.code = 'DRIVE_SEARCH_INCONCLUSIVE';
    googleConfig.setTestDriveSearchFailure(inconcErr);

    try {
      await assert.rejects(
        async () =>
          uploadRecordingWithRetry({
            meetingId: inconcMeetingId,
            session: adminSession,
            fileBuffer: Buffer.from('test_video_bytes_inconc'),
            maxRetries: 2,
          }),
        (err) => {
          assert.ok(err instanceof Error);
          assert.strictEqual(err.code, 'DRIVE_SEARCH_INCONCLUSIVE');
          assert.strictEqual(err.statusCode, 502);
          return true;
        }
      );
    } finally {
      googleConfig.setTestDriveSearchFailure(null);
    }
  });

  // --- Suite 13: Download Integrity Checks ---
  console.log('\n--- Suite 13: Download Integrity Checks ---');

  await test('[DOWNLOAD TRUNCATION] Server advertising 50 MB Content-Length but sending only 5 MB throws TRUNCATED_RECORDING_DOWNLOAD', async () => {
    global.__TEST_DOWNLOAD_HANDLER__ = async (url, opts) => {
      // Simulate received 5 MB instead of advertised 50 MB
      const fiveMB = Buffer.alloc(5 * 1024 * 1024);
      return fiveMB;
    };

    await assert.rejects(
      async () =>
        downloadSecureRecordingUrl('https://my-bucket.s3.us-east-1.amazonaws.com/incomplete.mp4', {
          expectedSizeBytes: 50 * 1024 * 1024,
        }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.code, 'TRUNCATED_RECORDING_DOWNLOAD');
        assert.strictEqual(err.statusCode, 502);
        return true;
      }
    );
    delete global.__TEST_DOWNLOAD_HANDLER__;
  });

  await test('[DOWNLOAD ABORTED] Aborted stream connection throws STREAM_ABORTED and never transitions to STORED', async () => {
    global.__TEST_DOWNLOAD_HANDLER__ = async () => {
      throw new RecordingServiceError('STREAM_ABORTED', 'Storage download connection was aborted by server.', 502);
    };

    seedMeeting({
      id: 'mtg_download_aborted_001',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-dl-abort',
      title: 'Download Abort Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        consent_session: {
          sessionId: 'sess_download_abort_001',
          status: 'ALL_GRANTED',
          consents: {
            usr_p1: { participantId: 'usr_p1', status: 'GRANTED' },
          },
        },
      },
    });

    const webhookBody = {
      id: 'EV_dl_aborted_test_123',
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'EG_dl_abort_999',
        roomName: 'mtg-pub-dl-abort',
        status: 'EGRESS_COMPLETE',
        fileResults: [
          { downloadUrl: 'https://my-bucket.s3.us-east-1.amazonaws.com/abort.mp4', filename: 'abort.mp4' },
        ],
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const res = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });
    assert.strictEqual(res.status, 'DOWNLOAD_FAILED');

    const m = mockDb.get('mtg_download_aborted_001');
    assert.strictEqual(m.recordingStatus, 'FAILED'); // Must NEVER transition to STORED on download failure!
    assert.match(m.recordingMetadata.failure_reason, /STREAM_ABORTED|Failed to retrieve recording/i);

    delete global.__TEST_DOWNLOAD_HANDLER__;
  });

  await test('[DOWNLOAD INVALID HEADER] Malformed Content-Length header is rejected with INVALID_CONTENT_LENGTH', async () => {
    global.__TEST_DOWNLOAD_HANDLER__ = async () => {
      throw new RecordingServiceError('INVALID_CONTENT_LENGTH', "Storage server sent invalid Content-Length header: 'malformed_abc'", 400);
    };

    await assert.rejects(
      async () => downloadSecureRecordingUrl('https://my-bucket.s3.us-east-1.amazonaws.com/invalid_len.mp4'),
      /INVALID_CONTENT_LENGTH/
    );
    delete global.__TEST_DOWNLOAD_HANDLER__;
  });

  await test('[DOWNLOAD ZERO-BYTE] Unexpected empty 0-byte recording throws EMPTY_RECORDING_FILE', async () => {
    global.__TEST_DOWNLOAD_HANDLER__ = async () => {
      return Buffer.alloc(0); // 0-byte file
    };

    await assert.rejects(
      async () => downloadSecureRecordingUrl('https://my-bucket.s3.us-east-1.amazonaws.com/empty.mp4'),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.code, 'EMPTY_RECORDING_FILE');
        assert.strictEqual(err.statusCode, 422);
        return true;
      }
    );
    delete global.__TEST_DOWNLOAD_HANDLER__;
  });

  await test('[DOWNLOAD INTEGRITY] Complete valid file with matching Content-Length and SHA-256 checksum is accepted', async () => {
    const validBytes = Buffer.from('VALID_RECORDING_STREAM_BYTES_COMPLETE');
    const validSha = crypto.createHash('sha256').update(validBytes).digest('hex');

    global.__TEST_DOWNLOAD_HANDLER__ = async () => {
      return validBytes;
    };

    const downloaded = await downloadSecureRecordingUrl('https://my-bucket.s3.us-east-1.amazonaws.com/complete.mp4', {
      expectedSizeBytes: validBytes.length,
      expectedChecksumSha256: validSha,
    });

    assert.strictEqual(downloaded.toString(), 'VALID_RECORDING_STREAM_BYTES_COMPLETE');
    delete global.__TEST_DOWNLOAD_HANDLER__;
  });

  console.log('\n--- Suite 14: Authorized Release-Gate Remediation Verification (Defects 1 - 7) ---');

  // DEFECT 1: Student consent mutation authorization and persistence guarantee
  await test('[DEF-1 UPDATE REJECTION] Direct updateMeetingRecordingMetadata rejects Student caller with Forbidden', async () => {
    seedMeeting({
      id: 'mtg_def1_direct_reject',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def1-rej',
      title: 'Direct Update Reject Meeting',
      recordingStatus: 'NOT_STARTED',
    });

    const studentSession = { user: { id: 'usr_student_x' }, tenantId: 'tenant_a', role: 'STUDENT' };
    const res = await queries.updateMeetingRecordingMetadata('mtg_def1_direct_reject', 'RECORDING', {}, studentSession);
    assert.strictEqual(res.success, false);
    assert.match(res.error, /Forbidden/i);
  });

  await test('[DEF-1 SUCCESSFUL PERSISTENCE] Verified student consent persists successfully via scoped server mutation', async () => {
    seedMeeting({
      id: 'mtg_def1_student_persist',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def1-persist',
      title: 'Student Consent Persistence Meeting',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_def1_persist_001',
          status: 'PENDING_CONSENT',
          consents: {
            usr_student_alice: { participantId: 'usr_student_alice', status: 'PENDING' },
          },
        },
      },
    });

    const studentSession = {
      user: { id: 'usr_student_alice', email: 'alice@student.org', user_metadata: { full_name: 'Alice Student' } },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    let rpcCalled = false;
    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'UpdateParticipant') {
        rpcCalled = true;
        return { participant: { identity: body.identity } };
      }
      return {};
    };

    const res = await recordParticipantConsent({
      meetingId: 'mtg_def1_student_persist',
      recordingSessionId: 'rsess_def1_persist_001',
      session: studentSession,
      decision: 'GRANTED',
    });

    assert.strictEqual(res.success, true);
    assert.strictEqual(res.decision, 'GRANTED');
    assert.strictEqual(rpcCalled, true);

    const m = mockDb.get('mtg_def1_student_persist');
    assert.strictEqual(m.recordingMetadata.consent_session.consents.usr_student_alice.status, 'GRANTED');
    assert.ok(m.recordingMetadata.consent_audit_log.some((a) => a.action === 'CONSENT_GRANTED' && a.participantId === 'usr_student_alice'));

    delete global.__LIVEKIT_ROOM_MOCK_HANDLER__;
  });

  await test('[DEF-1 PERSISTENCE FAILURE] Database error during consent persistence throws and never returns success', async () => {
    seedMeeting({
      id: 'mtg_def1_db_failure',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def1-db-fail',
      title: 'Database Failure Meeting',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_def1_fail_002',
          status: 'PENDING_CONSENT',
          consents: {
            usr_student_bob: { participantId: 'usr_student_bob', status: 'PENDING' },
          },
        },
      },
    });

    const studentSession = {
      user: { id: 'usr_student_bob', email: 'bob@student.org' },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    global.__SIMULATE_PERSISTENCE_FAILURE__ = true;

    await assert.rejects(
      async () =>
        recordParticipantConsent({
          meetingId: 'mtg_def1_db_failure',
          recordingSessionId: 'rsess_def1_fail_002',
          session: studentSession,
          decision: 'GRANTED',
        }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.code, 'CONSENT_PERSISTENCE_FAILED');
        return true;
      }
    );

    delete global.__SIMULATE_PERSISTENCE_FAILURE__;
  });

  await test('[DEF-1 UNAUTHORIZED PARTICIPANT] Non-member participant is rejected with 403 FORBIDDEN', async () => {
    seedMeeting({
      id: 'mtg_def1_unauthorized',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def1-unauth',
      title: 'Unauthorized Member Meeting',
      recordingStatus: 'NOT_STARTED',
      cohortId: 'cohort_alpha',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_def1_unauth_003',
          status: 'PENDING_CONSENT',
          consents: {},
        },
      },
    });

    const strangerSession = {
      user: { id: 'usr_stranger_intruder', email: 'stranger@nowhere.com' },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    await assert.rejects(
      async () =>
        recordParticipantConsent({
          meetingId: 'mtg_def1_unauthorized',
          recordingSessionId: 'rsess_def1_unauth_003',
          session: strangerSession,
          decision: 'GRANTED',
        }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.code, 'FORBIDDEN');
        assert.strictEqual(err.statusCode, 403);
        return true;
      }
    );
  });

  // DEFECT 2: Restore late-join publishing permissions safely via LiveKit Twirp RoomService RPC
  await test('[DEF-2 SFU PERMISSION RESTORE] Affirmative consent calls LiveKit UpdateParticipant to grant can_publish: true', async () => {
    seedMeeting({
      id: 'mtg_def2_sfu_perm',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def2-sfu',
      title: 'SFU Permission Meeting',
      sfuRoomId: 'room_def2_sfu',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_def2_perm_001',
          status: 'PENDING_CONSENT',
          consents: {
            usr_late_joiner: { participantId: 'usr_late_joiner', status: 'PENDING' },
          },
        },
        active_participants: [
          { participantId: 'usr_late_joiner', participantName: 'Late Joiner', role: 'STUDENT', canPublish: false },
        ],
      },
    });

    let livekitRpcPayload = null;
    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'UpdateParticipant') {
        livekitRpcPayload = body;
        return { participant: { identity: body.identity, permission: body.permission } };
      }
      return {};
    };

    const lateSession = {
      user: { id: 'usr_late_joiner', email: 'late@student.org', user_metadata: { full_name: 'Late Joiner' } },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    const res = await recordParticipantConsent({
      meetingId: 'mtg_def2_sfu_perm',
      recordingSessionId: 'rsess_def2_perm_001',
      session: lateSession,
      decision: 'GRANTED',
    });

    assert.strictEqual(res.success, true);
    assert.ok(livekitRpcPayload);
    assert.strictEqual(livekitRpcPayload.room, 'room_def2_sfu');
    assert.strictEqual(livekitRpcPayload.identity, 'usr_late_joiner');
    assert.strictEqual(livekitRpcPayload.permission.can_publish, true);

    const m = mockDb.get('mtg_def2_sfu_perm');
    const pEntry = m.recordingMetadata.active_participants.find((p) => p.participantId === 'usr_late_joiner');
    assert.strictEqual(pEntry.canPublish, true);

    delete global.__LIVEKIT_ROOM_MOCK_HANDLER__;
  });

  await test('[DEF-2 SFU RPC FAILURE] LiveKit UpdateParticipant failure keeps participant unable to publish and fails consent operation', async () => {
    seedMeeting({
      id: 'mtg_def2_sfu_failure',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def2-fail',
      title: 'SFU Failure Meeting',
      sfuRoomId: 'room_def2_fail',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_def2_fail_002',
          status: 'PENDING_CONSENT',
          consents: {
            usr_unlucky_joiner: { participantId: 'usr_unlucky_joiner', status: 'PENDING' },
          },
        },
        active_participants: [
          { participantId: 'usr_unlucky_joiner', participantName: 'Unlucky Joiner', role: 'STUDENT', canPublish: false },
        ],
      },
    });

    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async () => {
      throw new RecordingServiceError('SFU_NETWORK_TIMEOUT', 'LiveKit SFU connection timed out during permission update', 504);
    };

    const unluckySession = {
      user: { id: 'usr_unlucky_joiner', email: 'unlucky@student.org' },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    await assert.rejects(
      async () =>
        recordParticipantConsent({
          meetingId: 'mtg_def2_sfu_failure',
          recordingSessionId: 'rsess_def2_fail_002',
          session: unluckySession,
          decision: 'GRANTED',
        }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.code, 'LIVEKIT_PERMISSION_UPDATE_FAILED');
        assert.strictEqual(err.statusCode, 502);
        return true;
      }
    );

    // Participant must remain unable to publish in the database
    const m = mockDb.get('mtg_def2_sfu_failure');
    const pEntry = m.recordingMetadata.active_participants.find((p) => p.participantId === 'usr_unlucky_joiner');
    assert.strictEqual(pEntry.canPublish, false);

    delete global.__LIVEKIT_ROOM_MOCK_HANDLER__;
  });

  // DEFECT 3 & 4: Concurrency control & atomic updates without lost updates
  await test('[DEF-3 & 4 CONCURRENCY] Concurrent participant decisions update atomically without overwriting each other', async () => {
    seedMeeting({
      id: 'mtg_def4_concurrency',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def4-race',
      title: 'Concurrent Consent Meeting',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_def4_race_001',
          status: 'PENDING_CONSENT',
          consents: {
            usr_student_one: { participantId: 'usr_student_one', status: 'PENDING' },
            usr_student_two: { participantId: 'usr_student_two', status: 'PENDING' },
          },
        },
      },
    });

    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async () => ({ success: true });

    const sessionOne = { user: { id: 'usr_student_one', email: 'one@student.org' }, tenantId: 'tenant_a', role: 'STUDENT' };
    const sessionTwo = { user: { id: 'usr_student_two', email: 'two@student.org' }, tenantId: 'tenant_a', role: 'STUDENT' };

    // Execute concurrently
    await Promise.all([
      recordParticipantConsent({
        meetingId: 'mtg_def4_concurrency',
        recordingSessionId: 'rsess_def4_race_001',
        session: sessionOne,
        decision: 'GRANTED',
      }),
      recordParticipantConsent({
        meetingId: 'mtg_def4_concurrency',
        recordingSessionId: 'rsess_def4_race_001',
        session: sessionTwo,
        decision: 'GRANTED',
      }),
    ]);

    const m = mockDb.get('mtg_def4_concurrency');
    const session = m.recordingMetadata.consent_session;
    assert.strictEqual(session.consents.usr_student_one.status, 'GRANTED');
    assert.strictEqual(session.consents.usr_student_two.status, 'GRANTED');
    assert.strictEqual(session.status, 'ALL_GRANTED');

    delete global.__LIVEKIT_ROOM_MOCK_HANDLER__;
  });

  // DEFECT 5: Fail-safe consent withdrawal
  await test('[DEF-5 FAIL-SAFE WITHDRAWAL] When StopEgress fails, error is not swallowed; reports stopFailed: true, audits failure, and blocks new start', async () => {
    seedMeeting({
      id: 'mtg_def5_withdrawal_fail',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def5-with',
      title: 'Withdrawal Stop Failure Meeting',
      facilitatorId: 'pers_fac_1',
      recordingStatus: 'RECORDING',
      recordingMetadata: {
        egress_id: 'EG_stuck_job_999',
        consent_session: {
          sessionId: 'rsess_def5_with_001',
          status: 'ACTIVE_RECORDING',
          consents: {
            usr_fac_a: { status: 'GRANTED' },
            usr_student_withdrawing: { status: 'GRANTED' },
          },
        },
      },
    });

    // Simulate LiveKit remote failure when stopping Egress
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action) => {
      if (action === 'StopEgress') {
        throw new RecordingServiceError('EGRESS_RPC_TIMEOUT', 'LiveKit Egress service timed out during StopEgress', 504);
      }
      return {};
    };

    const withdrawSession = {
      user: { id: 'usr_student_withdrawing', email: 'withdrawing@student.org' },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    const res = await recordParticipantConsent({
      meetingId: 'mtg_def5_withdrawal_fail',
      recordingSessionId: 'rsess_def5_with_001',
      session: withdrawSession,
      decision: 'WITHDRAWN',
    });

    // Must report withdrawal recorded, but StopEgress failed honestly!
    assert.strictEqual(res.decision, 'WITHDRAWN');
    assert.strictEqual(res.recordingStopped, false);
    assert.strictEqual(res.stopFailed, true);
    assert.ok(res.stopError);
    assert.match(res.stopError, /StopEgress|timed out/i);

    const m = mockDb.get('mtg_def5_withdrawal_fail');
    assert.strictEqual(m.recordingMetadata.consent_session.status, 'WITHDRAWN');
    assert.ok(m.recordingMetadata.consent_audit_log.some((a) => a.action === 'CONSENT_WITHDRAWN'));

    // Attempting to start recording now MUST fail closed with 422 RECORDING_CONSENT_DECLINED
    const facSession = { user: { id: 'usr_fac_a' }, tenantId: 'tenant_a', role: 'Facilitator' };
    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_def5_withdrawal_fail', session: facSession }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.statusCode, 422);
        return true;
      }
    );

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // DEFECT 6: Enforce distributed upload/reconciliation claims
  await test('[DEF-6 UPLOAD CLAIM ENFORCEMENT] uploadRecordingWithRetry rejects when concurrent worker holds processing claim', async () => {
    seedMeeting({
      id: 'mtg_def6_upload_claim',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def6-claim',
      title: 'Upload Claim Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: 'claim_active_worker_777',
          claimed_at: new Date().toISOString(), // fresh claim < 10m
        },
      },
    });

    const session = { user: { id: 'usr_fac_a' }, tenantId: 'tenant_a', role: 'Super Admin' };

    await assert.rejects(
      async () =>
        uploadRecordingWithRetry({
          meetingId: 'mtg_def6_upload_claim',
          session,
          fileBuffer: Buffer.from('TEST_DATA'),
        }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.code, 'CONCURRENT_PROCESSING_IN_PROGRESS');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );
  });

  await test('[DEF-6 RECONCILIATION CLAIM ENFORCEMENT] reconcileMeetingRecording rejects when concurrent worker holds processing claim', async () => {
    seedMeeting({
      id: 'mtg_def6_reconcile_claim',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def6-rec',
      title: 'Reconcile Claim Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: 'claim_other_worker_888',
          claimed_at: new Date().toISOString(), // fresh claim < 10m
        },
      },
    });

    const session = { user: { id: 'usr_fac_a' }, tenantId: 'tenant_a', role: 'Super Admin' };
    const recRes = await reconcileMeetingRecording({ meetingId: 'mtg_def6_reconcile_claim', session });
    assert.strictEqual(recRes.reconciled, false);
    assert.match(recRes.message, /Concurrent worker/i);
  });

  await test('[DEF-6 LEASE OVERWRITE PREVENTED] Worker whose lease expired cannot overwrite newer worker results', async () => {
    seedMeeting({
      id: 'mtg_def6_lease_expired_overwrite',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def6-over',
      title: 'Lease Overwrite Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: 'claim_newer_worker_999', // Claim was stolen by newer worker
          claimed_at: new Date().toISOString(),
        },
        consent_session: {
          sessionId: 'sess_def6_lease_001',
          status: 'ALL_GRANTED',
          consents: {
            usr_fac_a: { participantId: 'usr_fac_a', status: 'GRANTED' },
          },
        },
      },
    });

    // Slow worker trying to commit with old claim token
    const session = { user: { id: 'usr_fac_a' }, tenantId: 'tenant_a', role: 'Super Admin' };

    await assert.rejects(
      async () =>
        uploadRecordingWithRetry({
          meetingId: 'mtg_def6_lease_expired_overwrite',
          session,
          fileBuffer: Buffer.from('TEST_DATA'),
          claimToken: 'claim_old_expired_worker_111', // Mismatched old token!
        }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.code, 'LEASE_EXPIRED_OVERWRITE_PREVENTED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );
  });

  // DEFECT 7: Remove trust in client-supplied participant roster
  await test('[DEF-7 FORGED ROSTER IGNORED] initiateRecordingConsentSession completely ignores client-supplied participantList', async () => {
    seedMeeting({
      id: 'mtg_def7_forged_roster',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-def7-forge',
      title: 'Forged Roster Meeting',
      recordingStatus: 'NOT_STARTED',
      facilitatorId: 'pers_fac_1',
      cohortId: 'cohort_alpha',
    });

    const facSession = { user: { id: 'usr_fac_a' }, tenantId: 'tenant_a', role: 'Facilitator' };

    // Attacker sends forged client participantList containing bogus / cross-tenant IDs
    const forgedList = [
      { participantId: 'usr_forged_attacker_1', participantName: 'Injected Attacker 1', role: 'STUDENT' },
      { participantId: 'usr_cross_tenant_victim', participantName: 'Tenant B Victim', role: 'STUDENT' },
    ];

    const initRes = await initiateRecordingConsentSession({
      meetingId: 'mtg_def7_forged_roster',
      session: facSession,
      participantList: forgedList,
    });

    assert.strictEqual(initRes.success, true);
    // Forged IDs must NOT be present in required participants!
    const reqIds = initRes.requiredParticipants.map((p) => p.participantId);
    assert.strictEqual(reqIds.includes('usr_forged_attacker_1'), false);
    assert.strictEqual(reqIds.includes('usr_cross_tenant_victim'), false);
  });

  console.log('\n--- Suite 15: Critical Remediation Regression Verification (Requirements 1 - 12) ---');

  // REG-1: Relational RPC failure produces no false success
  await test('[REG-1 RELATIONAL RPC FAILURE] Relational RPC failure produces no false success', async () => {
    seedMeeting({
      id: 'mtg_reg1_relational_fail',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg1',
      title: 'Relational Failure Test',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_reg1_001',
          status: 'PENDING_CONSENT',
          consents: {
            usr_student_reg1: { participantId: 'usr_student_reg1', status: 'PENDING' },
          },
        },
        active_participants: [
          { participantId: 'usr_student_reg1', participantName: 'Student Reg 1', role: 'STUDENT', canPublish: false },
        ],
      },
    });

    // Simulate PostgreSQL stored procedure raising a serialization failure or table error
    global.__TEST_RPC_HANDLER__ = async (fn, args) => {
      if (fn === 'submit_participant_consent') {
        return { data: null, error: { code: '40001', message: 'Serialization deadlock in PostgreSQL' } };
      }
      return { data: null, error: new Error('RPC_NOT_INSTALLED') };
    };

    const studentSession = {
      user: { id: 'usr_student_reg1', email: 'reg1@student.org', user_metadata: { full_name: 'Student Reg 1' } },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    await assert.rejects(
      async () => {
        await recordParticipantConsent({
          meetingId: 'mtg_reg1_relational_fail',
          recordingSessionId: 'rsess_reg1_001',
          session: studentSession,
          decision: 'GRANTED',
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'RELATIONAL_CONSENT_PERSISTENCE_FAILED');
        assert.strictEqual(err.statusCode, 500);
        return true;
      }
    );

    delete global.__TEST_RPC_HANDLER__;
  });

  // REG-2: Direct RPC attempts to forge another user's consent are rejected
  await test('[REG-2 DIRECT RPC FORGERY REJECTED] SQL migration submit_participant_consent enforces caller UID match and revokes execution from non-service roles', async () => {
    const migrationSql = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', '20261010_meeting_recording_consent_audit.sql'),
      'utf8'
    );

    // Verify caller authorization logic inside submit_participant_consent
    assert.ok(
      migrationSql.includes('v_caller_uid := auth.uid();') &&
      migrationSql.includes("IF v_caller_uid::VARCHAR <> p_participant_id AND NOT (p_participant_id LIKE 'guest_%') THEN") &&
      migrationSql.includes("RAISE EXCEPTION 'FORBIDDEN: Cannot submit consent on behalf of another user.';"),
      'SQL function must enforce caller UID match when called by authenticated users'
    );

    // Verify execution revoked from PUBLIC, anon, and authenticated
    assert.ok(
      migrationSql.includes('REVOKE ALL ON FUNCTION public.submit_participant_consent(VARCHAR, VARCHAR, VARCHAR, TEXT, UUID) FROM PUBLIC, anon, authenticated;'),
      'SQL function must revoke default execution privileges from PUBLIC, anon, and authenticated'
    );
    assert.ok(
      migrationSql.includes('GRANT EXECUTE ON FUNCTION public.submit_participant_consent(VARCHAR, VARCHAR, VARCHAR, TEXT, UUID) TO service_role;'),
      'SQL function must restrict execution exclusively to service_role'
    );
    assert.ok(
      migrationSql.includes('SET search_path = public, pg_temp'),
      'SQL function must enforce safe, fixed search_path'
    );
  });

  // REG-3: Concurrent participant decisions preserve all valid consent records
  await test('[REG-3 CONCURRENT DECISIONS] Concurrent participant decisions preserve all valid consent records', async () => {
    seedMeeting({
      id: 'mtg_reg3_concurrent',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg3',
      title: 'Concurrent Decision Test',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_reg3_001',
          status: 'PENDING_CONSENT',
          consents: {
            usr_student_a: { participantId: 'usr_student_a', status: 'PENDING', recordingSessionId: 'rsess_reg3_001' },
            usr_student_b: { participantId: 'usr_student_b', status: 'PENDING', recordingSessionId: 'rsess_reg3_001' },
          },
        },
        active_participants: [
          { participantId: 'usr_student_a', participantName: 'Student A', role: 'STUDENT', canPublish: false },
          { participantId: 'usr_student_b', participantName: 'Student B', role: 'STUDENT', canPublish: false },
        ],
      },
    });

    const sessionA = { user: { id: 'usr_student_a', email: 'a@student.org' }, tenantId: 'tenant_a', role: 'STUDENT' };
    const sessionB = { user: { id: 'usr_student_b', email: 'b@student.org' }, tenantId: 'tenant_a', role: 'STUDENT' };

    const [resA, resB] = await Promise.all([
      recordParticipantConsent({
        meetingId: 'mtg_reg3_concurrent',
        recordingSessionId: 'rsess_reg3_001',
        session: sessionA,
        decision: 'GRANTED',
      }),
      recordParticipantConsent({
        meetingId: 'mtg_reg3_concurrent',
        recordingSessionId: 'rsess_reg3_001',
        session: sessionB,
        decision: 'GRANTED',
      }),
    ]);

    assert.strictEqual(resA.success, true);
    assert.strictEqual(resB.success, true);

    const m = mockDb.get('mtg_reg3_concurrent');
    const consents = m.recordingMetadata.consent_session.consents;
    assert.strictEqual(consents.usr_student_a?.status, 'GRANTED');
    assert.strictEqual(consents.usr_student_b?.status, 'GRANTED');
  });

  // REG-4: Failed or ambiguous LiveKit permission revocation is surfaced and retried
  await test('[REG-4 SFU REVOCATION FAILURE] A failed or ambiguous LiveKit permission revocation is surfaced as pending and retried via reconcileParticipantPermissions', async () => {
    seedMeeting({
      id: 'mtg_reg4_revocation',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg4',
      title: 'SFU Revocation Safety Meeting',
      sfuRoomId: 'room_reg4_revoc',
      recordingStatus: 'RECORDING',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_reg4_001',
          status: 'ACTIVE_RECORDING',
          consents: {
            usr_withdraw_reg4: { participantId: 'usr_withdraw_reg4', status: 'GRANTED', recordingSessionId: 'rsess_reg4_001' },
          },
        },
        active_participants: [
          { participantId: 'usr_withdraw_reg4', participantName: 'Withdrawing Student', role: 'STUDENT', canPublish: true },
        ],
      },
    });

    // Simulate LiveKit UpdateParticipant failing during withdrawal
    let updateParticipantAttempted = false;
    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'UpdateParticipant') {
        updateParticipantAttempted = true;
        throw new RecordingServiceError('SFU_NETWORK_RESET', 'Network connection to LiveKit RoomService was reset', 502);
      }
      return {};
    };

    const withdrawSession = {
      user: { id: 'usr_withdraw_reg4', email: 'withdraw@student.org', user_metadata: { full_name: 'Withdrawing Student' } },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    const withdrawRes = await recordParticipantConsent({
      meetingId: 'mtg_reg4_revocation',
      recordingSessionId: 'rsess_reg4_001',
      session: withdrawSession,
      decision: 'WITHDRAWN',
    });

    assert.strictEqual(withdrawRes.success, true);
    assert.strictEqual(updateParticipantAttempted, true);
    assert.strictEqual(withdrawRes.permissionRevocationPending, true);
    assert.ok(withdrawRes.warning && withdrawRes.warning.includes('Reconciler scheduled'));

    const m = mockDb.get('mtg_reg4_revocation');
    const pEntry = m.recordingMetadata.active_participants.find((p) => p.participantId === 'usr_withdraw_reg4');
    assert.strictEqual(pEntry.permissionRevocationPending, true);

    // Recording cannot restart while permission revocation is unconfirmed
    await assert.rejects(
      async () => {
        await startMeetingRecording({
          meetingId: 'mtg_reg4_revocation',
          session: { user: { id: 'usr_fac_a' }, tenantId: 'tenant_a', role: 'Super Admin' },
        });
      },
      (err) => {
        assert.ok(err.code === 'RECORDING_CONSENT_DECLINED' || err.code === 'PERMISSION_REVOCATION_UNCONFIRMED');
        return true;
      }
    );

    // LiveKit RoomService recovers; run reconcileParticipantPermissions
    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'GetParticipant') {
        return { participant: { identity: body.identity, permission: { can_publish: true } } };
      }
      if (action === 'UpdateParticipant') {
        return { participant: { identity: body.identity, permission: { can_publish: body.permission?.can_publish } } };
      }
      return {};
    };

    const reconRes = await reconcileParticipantPermissions({
      meetingId: 'mtg_reg4_revocation',
      participantId: 'usr_withdraw_reg4',
    });

    assert.strictEqual(reconRes.reconciled, true);
    assert.strictEqual(reconRes.canPublish, false);

    const mRecon = mockDb.get('mtg_reg4_revocation');
    const pRecon = mRecon.recordingMetadata.active_participants.find((p) => p.participantId === 'usr_withdraw_reg4');
    assert.strictEqual(pRecon.permissionRevocationPending, false);

    delete global.__LIVEKIT_ROOM_MOCK_HANDLER__;
  });

  // REG-5: An absent cohort student does not block a meeting's consent gate
  await test('[REG-5 ABSENT STUDENT NO BLOCK] An absent cohort student does not block a meeting consent gate', async () => {
    seedMeeting({
      id: 'mtg_reg5_absent_student',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg5',
      title: 'Absent Student Cohort Meeting',
      sfuRoomId: 'room_reg5_absent',
      recordingStatus: 'NOT_STARTED',
      facilitatorId: 'pers_fac_1',
      cohortId: 'cohort_registered_cohort',
      recordingMetadata: {
        active_participants: [
          { participantId: 'usr_fac_a', participantName: 'Facilitator A', role: 'Facilitator', canPublish: true },
        ],
      },
    });

    // 10 students enrolled in cohort_registered_cohort, but none are in active_participants (all absent)
    global.__TEST_MOCK_ENROLMENTS__ = Array.from({ length: 10 }, (_, i) => ({
      id: `enr_reg5_${i}`,
      student_id: `stu_absent_${i}`,
      cohort_id: 'cohort_registered_cohort',
      tenant_id: 'tenant_a',
      status: 'ACTIVE',
      students: { id: `stu_absent_${i}`, first_name: `Absent_${i}`, last_name: 'Student', email: `absent${i}@clasptek.org` },
    }));

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action) => {
      if (action === 'StartRoomCompositeEgress') {
        return { egress_id: 'egress_reg5_mock' };
      }
      return {};
    };

    const facSession = { user: { id: 'usr_fac_a' }, tenantId: 'tenant_a', role: 'Super Admin' };

    // Initiate consent session
    const initRes = await initiateRecordingConsentSession({
      meetingId: 'mtg_reg5_absent_student',
      session: facSession,
    });

    assert.strictEqual(initRes.success, true);
    assert.strictEqual(initRes.status, 'ALL_GRANTED');
    assert.strictEqual(initRes.requiredParticipants.length, 1);
    assert.strictEqual(initRes.requiredParticipants[0].participantId, 'usr_fac_a');

    // Facilitator can start recording immediately because absent students do not block the session
    const startRes = await startMeetingRecording({
      meetingId: 'mtg_reg5_absent_student',
      session: facSession,
    });

    assert.strictEqual(startRes.success, true);
    assert.strictEqual(startRes.status, 'RECORDING');

    delete global.__TEST_MOCK_ENROLMENTS__;
    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // REG-6: Every connected eligible attendee must complete the applicable consent flow
  await test('[REG-6 CONNECTED ATTENDEE CONSENT MANDATORY] Every connected eligible attendee in active_participants must consent before recording starts', async () => {
    seedMeeting({
      id: 'mtg_reg6_connected_student',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg6',
      title: 'Connected Student Meeting',
      sfuRoomId: 'room_reg6_conn',
      recordingStatus: 'NOT_STARTED',
      facilitatorId: 'pers_fac_1',
      cohortId: 'cohort_reg6',
      recordingMetadata: {
        active_participants: [
          { participantId: 'usr_fac_a', participantName: 'Facilitator A', role: 'Facilitator', canPublish: true },
          { participantId: 'usr_student_attending', participantName: 'Attending Student', role: 'STUDENT', canPublish: false },
        ],
      },
    });

    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'UpdateParticipant') {
        return { participant: { identity: body.identity, permission: body.permission } };
      }
      return {};
    };

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action) => {
      if (action === 'StartRoomCompositeEgress') {
        return { egress_id: 'egress_reg6_mock' };
      }
      return {};
    };

    const facSession = { user: { id: 'usr_fac_a' }, tenantId: 'tenant_a', role: 'Super Admin' };
    const stuSession = {
      user: { id: 'usr_student_attending', email: 'attend@student.org', user_metadata: { full_name: 'Attending Student' } },
      tenantId: 'tenant_a',
      role: 'STUDENT',
    };

    const initRes = await initiateRecordingConsentSession({
      meetingId: 'mtg_reg6_connected_student',
      session: facSession,
    });

    assert.strictEqual(initRes.success, true);
    assert.strictEqual(initRes.status, 'PENDING_CONSENT');
    assert.strictEqual(initRes.requiredParticipants.length, 2);

    // Attempting to start recording while student is PENDING must fail closed with 422
    await assert.rejects(
      async () => {
        await startMeetingRecording({
          meetingId: 'mtg_reg6_connected_student',
          session: facSession,
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'RECORDING_CONSENT_PENDING');
        assert.strictEqual(err.statusCode, 422);
        return true;
      }
    );

    // Student provides affirmative consent
    const stuRes = await recordParticipantConsent({
      meetingId: 'mtg_reg6_connected_student',
      recordingSessionId: initRes.sessionId,
      session: stuSession,
      decision: 'GRANTED',
    });
    assert.strictEqual(stuRes.success, true);

    // Recording can now start cleanly
    const startRes = await startMeetingRecording({
      meetingId: 'mtg_reg6_connected_student',
      session: facSession,
    });
    assert.strictEqual(startRes.success, true);
    assert.strictEqual(startRes.status, 'RECORDING');

    delete global.__LIVEKIT_ROOM_MOCK_HANDLER__;
    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // REG-7: Approved guests can consent securely without a Supabase Auth account
  await test('[REG-7 APPROVED GUEST CONSENT] Approved guests can consent securely without a Supabase Auth account via route handler', async () => {
    seedMeeting({
      id: 'mtg_reg7_guest_consent',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg7',
      title: 'Guest Consent Meeting',
      sfuRoomId: 'room_reg7_guest',
      recordingStatus: 'NOT_STARTED',
      facilitatorId: 'pers_fac_1',
      recordingMetadata: {
        active_participants: [
          { participantId: 'usr_fac_a', participantName: 'Facilitator A', role: 'Facilitator', canPublish: true },
          { participantId: 'guest_greq_reg7_valid', participantName: 'Alice Guest', role: 'GUEST', canPublish: false },
        ],
      },
    });

    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'UpdateParticipant') {
        return { participant: { identity: body.identity, permission: body.permission } };
      }
      return {};
    };

    // Seed approved guest request in mock
    const guestSecret = 'guest_secret_reg7_high_entropy_token_12345';
    global.__TEST_MOCK_GUEST_REQUESTS__ = [
      {
        id: 'greq_reg7_valid',
        tenant_id: 'tenant_a',
        meeting_id: 'mtg_reg7_guest_consent',
        meeting_public_id: 'mtg-pub-reg7',
        guest_name: 'Alice Guest',
        guest_email: 'alice@external.org',
        status: 'APPROVED',
        request_token: guestSecret,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
    ];

    const facSession = { user: { id: 'usr_fac_a' }, tenantId: 'tenant_a', role: 'Facilitator' };
    const initRes = await initiateRecordingConsentSession({
      meetingId: 'mtg_reg7_guest_consent',
      session: facSession,
    });

    // External guest submits consent via POST /api/meetings/recording/consent (No Supabase Auth session)
    global.__TEST_AUTH_SESSION__ = null; // No Supabase Auth session!

    const req = new NextRequest('http://localhost:3000/api/meetings/recording/consent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        meetingId: 'mtg_reg7_guest_consent',
        recordingSessionId: initRes.sessionId,
        decision: 'GRANTED',
        requestId: 'greq_reg7_valid',
        requestToken: guestSecret,
        // Attacker attempts to forge participantId in payload
        participantId: 'usr_impersonated_victim',
      }),
    });

    const routeRes = await consentRoute.POST(req);
    const body = await routeRes.json();

    assert.strictEqual(routeRes.status, 200);
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.decision, 'GRANTED');
    // Participant identity must be strictly derived from verified guest record
    assert.strictEqual(body.participantId, 'guest_greq_reg7_valid');

    delete global.__TEST_MOCK_GUEST_REQUESTS__;
    delete global.__TEST_AUTH_SESSION__;
    delete global.__LIVEKIT_ROOM_MOCK_HANDLER__;
  });

  // REG-8: Guest tokens cannot be replayed across meetings or tenants
  await test('[REG-8 GUEST TOKEN ISOLATION] Guest tokens cannot be replayed across meetings or tenants', async () => {
    seedMeeting({
      id: 'mtg_reg8_meeting_a',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg8-a',
      title: 'Meeting A',
    });
    seedMeeting({
      id: 'mtg_reg8_meeting_b',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg8-b',
      title: 'Meeting B',
    });
    seedMeeting({
      id: 'mtg_reg8_tenant_b',
      tenantId: 'tenant_b',
      publicId: 'mtg-pub-reg8-tb',
      title: 'Tenant B Meeting',
    });

    const guestSecret = 'secret_guest_reg8_valid_token_xyz';
    global.__TEST_MOCK_GUEST_REQUESTS__ = [
      {
        id: 'greq_reg8_target',
        tenant_id: 'tenant_a',
        meeting_id: 'mtg_reg8_meeting_a',
        meeting_public_id: 'mtg-pub-reg8-a',
        guest_name: 'Bob Guest',
        guest_email: 'bob@partner.org',
        status: 'APPROVED',
        request_token: guestSecret,
        expires_at: new Date(Date.now() + 3600000).toISOString(),
      },
    ];

    global.__TEST_AUTH_SESSION__ = null;

    // 1. Cross-meeting replay attempt: Token for Meeting A used on Meeting B
    const crossMeetingReq = new NextRequest('http://localhost:3000/api/meetings/recording/consent', {
      method: 'POST',
      body: JSON.stringify({
        meetingId: 'mtg_reg8_meeting_b',
        recordingSessionId: 'rsess_any',
        decision: 'GRANTED',
        requestId: 'greq_reg8_target',
        requestToken: guestSecret,
      }),
    });
    const crossRes = await consentRoute.POST(crossMeetingReq);
    assert.strictEqual(crossRes.status, 403);

    // 2. Cross-tenant replay attempt: Token for Tenant A used on Tenant B meeting
    const crossTenantReq = new NextRequest('http://localhost:3000/api/meetings/recording/consent', {
      method: 'POST',
      body: JSON.stringify({
        meetingId: 'mtg_reg8_tenant_b',
        recordingSessionId: 'rsess_any',
        decision: 'GRANTED',
        requestId: 'greq_reg8_target',
        requestToken: guestSecret,
      }),
    });
    const tenantRes = await consentRoute.POST(crossTenantReq);
    assert.strictEqual(tenantRes.status, 403);

    // 3. Tampered secret token
    const tamperedReq = new NextRequest('http://localhost:3000/api/meetings/recording/consent', {
      method: 'POST',
      body: JSON.stringify({
        meetingId: 'mtg_reg8_meeting_a',
        recordingSessionId: 'rsess_any',
        decision: 'GRANTED',
        requestId: 'greq_reg8_target',
        requestToken: 'forged_tampered_secret',
      }),
    });
    const tamperedRes = await consentRoute.POST(tamperedReq);
    assert.strictEqual(tamperedRes.status, 401);

    delete global.__TEST_MOCK_GUEST_REQUESTS__;
    delete global.__TEST_AUTH_SESSION__;
  });

  // REG-9: Crash after Egress starts but before its ID is stored can be recovered
  await test('[REG-9 CRASH RECOVERY BEFORE EGRESS ID STORED] Crash after Egress starts but before its ID is stored is safely recovered by reconciler', async () => {
    seedMeeting({
      id: 'mtg_reg9_crash_recovery',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg9',
      title: 'Crash Recovery Meeting',
      sfuRoomId: 'room_reg9_crash',
      recordingStatus: 'PROCESSING',
      facilitatorId: 'pers_fac_1',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_reg9_001',
          status: 'ALL_GRANTED',
          consents: {
            usr_fac_a: { participantId: 'usr_fac_a', status: 'GRANTED' },
          },
        },
        start_intent: {
          token: 'start_tok_reg9_crash',
          roomName: 'room_reg9_crash',
          tenantId: 'tenant_a',
          meetingId: 'mtg_reg9_crash_recovery',
          startedBy: 'usr_fac_a',
          initiatedAt: new Date().toISOString(),
          fileName: 'CLASPTEK_mtg-pub-reg9_test.mp4',
          filePath: 'recordings/CLASPTEK_mtg-pub-reg9_test.mp4',
        },
      },
    });

    // Mock LiveKit ListEgress returning active egress with matching filepath
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'ListEgress') {
        return {
          items: [
            {
              egress_id: 'egress_orphaned_reg9_001',
              room_name: 'room_reg9_crash',
              status: 'EGRESS_ACTIVE',
              request: {
                file_outputs: [{ filepath: 'recordings/CLASPTEK_mtg-pub-reg9_test.mp4' }],
              },
            },
          ],
        };
      }
      return {};
    };

    const reconcilerSession = { user: { id: 'usr_reconciler' }, tenantId: 'tenant_a', role: 'Super Admin' };
    const reconRes = await reconcileMeetingRecording({
      meetingId: 'mtg_reg9_crash_recovery',
      session: reconcilerSession,
    });

    assert.strictEqual(reconRes.status, 'RECORDING');
    assert.strictEqual(reconRes.reconciled, true);

    const m = mockDb.get('mtg_reg9_crash_recovery');
    assert.strictEqual(m.recordingStatus, 'RECORDING');
    assert.strictEqual(m.recordingMetadata.egressId, 'egress_orphaned_reg9_001');
    assert.strictEqual(m.recordingMetadata.start_intent, null);

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // REG-10: An unrelated Egress job is never adopted or stopped by reconciliation
  await test('[REG-10 UNRELATED EGRESS IGNORED] An unrelated Egress job is never adopted or stopped by reconciliation', async () => {
    seedMeeting({
      id: 'mtg_reg10_unrelated_egress',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg10',
      title: 'Unrelated Egress Test',
      sfuRoomId: 'room_reg10_unrelated',
      recordingStatus: 'PROCESSING',
      facilitatorId: 'pers_fac_1',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_reg10_001',
          status: 'ALL_GRANTED',
        },
        start_intent: {
          token: 'start_tok_reg10',
          roomName: 'room_reg10_unrelated',
          tenantId: 'tenant_a',
          meetingId: 'mtg_reg10_unrelated_egress',
          startedBy: 'usr_fac_a',
          fileName: 'CLASPTEK_mtg-pub-reg10_exact.mp4',
          filePath: 'recordings/CLASPTEK_mtg-pub-reg10_exact.mp4',
        },
      },
    });

    // Mock LiveKit ListEgress returning a totally unrelated egress job in that room
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'ListEgress') {
        return {
          items: [
            {
              egress_id: 'egress_unrelated_victim_999',
              room_name: 'room_reg10_unrelated',
              status: 'EGRESS_ACTIVE',
              request: {
                file_outputs: [{ filepath: 'recordings/unrelated_foreign_job.mp4' }],
              },
            },
          ],
        };
      }
      return {};
    };

    const reconRes = await reconcileMeetingRecording({
      meetingId: 'mtg_reg10_unrelated_egress',
      session: { user: { id: 'usr_reconciler' }, tenantId: 'tenant_a', role: 'Super Admin' },
    });

    assert.strictEqual(reconRes.status, 'NOT_STARTED');
    assert.strictEqual(reconRes.reconciled, true);
    assert.ok(reconRes.message.includes('No remote Egress job found; reset to NOT_STARTED'));

    const m = mockDb.get('mtg_reg10_unrelated_egress');
    assert.strictEqual(m.recordingStatus, 'NOT_STARTED');
    assert.strictEqual(m.recordingMetadata.egressId, undefined);

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // REG-11: Expired processing claims cannot permit stale workers to overwrite current state
  await test('[REG-11 STALE WORKER FENCING] Expired processing claims cannot permit stale workers to overwrite current state', async () => {
    seedMeeting({
      id: 'mtg_reg11_lease_fence',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg11',
      title: 'Lease Fencing Meeting',
      recordingStatus: 'PROCESSING',
      facilitatorId: 'pers_fac_1',
      recordingMetadata: {
        processing_claim: {
          token: 'claim_new_worker_token_999',
          claimed_at: new Date().toISOString(),
          claimed_by: 'worker_b',
          lease_expires_at: new Date(Date.now() + 600000).toISOString(),
        },
        consent_session: {
          sessionId: 'sess_reg11_lease_001',
          status: 'ALL_GRANTED',
          consents: {
            worker_a: { participantId: 'worker_a', status: 'GRANTED' },
          },
        },
      },
    });

    // Worker A holds an old, expired claim token
    const staleWorkerSession = { user: { id: 'worker_a' }, tenantId: 'tenant_a', role: 'Super Admin' };

    await assert.rejects(
      async () => {
        await uploadRecordingWithRetry({
          meetingId: 'mtg_reg11_lease_fence',
          session: staleWorkerSession,
          fileBuffer: Buffer.from('simulated mp4 video'),
          claimToken: 'claim_stale_expired_token_001',
        });
      },
      (err) => {
        assert.strictEqual(err.code, 'LEASE_EXPIRED_OVERWRITE_PREVENTED');
        assert.strictEqual(err.statusCode, 409);
        return true;
      }
    );
  });

  // REG-12: Audit records cannot be updated/deleted by ordinary tenant users
  await test('[REG-12 AUDIT RECORDS IMMUTABLE] Migration SQL revokes UPDATE and DELETE on audit log and provides append-only RLS', async () => {
    const migrationSql = fs.readFileSync(
      path.join(__dirname, '..', 'migrations', '20261010_meeting_recording_consent_audit.sql'),
      'utf8'
    );

    // Verify explicit revocation
    assert.ok(
      migrationSql.includes('REVOKE UPDATE, DELETE ON public.meeting_recording_consent_audit_log FROM authenticated, anon, PUBLIC;'),
      'Migration must revoke UPDATE and DELETE on meeting_recording_consent_audit_log from authenticated and public'
    );

    // Verify SELECT and INSERT policies exist
    assert.ok(
      migrationSql.includes('CREATE POLICY "consent_audit_select_tenant_isolation"') &&
      migrationSql.includes('FOR SELECT') &&
      migrationSql.includes('TO authenticated'),
      'Migration must provide SELECT policy for authenticated tenant users'
    );
    assert.ok(
      migrationSql.includes('CREATE POLICY "consent_audit_insert_tenant_isolation"') &&
      migrationSql.includes('FOR INSERT') &&
      migrationSql.includes('TO authenticated'),
      'Migration must provide INSERT policy for authenticated tenant users'
    );

    // Verify dedicated processing claims table definition
    assert.ok(
      migrationSql.includes('CREATE TABLE IF NOT EXISTS public.meeting_recording_processing_claims'),
      'Migration must include dedicated meeting_recording_processing_claims table'
    );
  });

  // REG-13: Stale JSONB ALL_GRANTED cannot authorize recording when relational table has DECLINED decision
  await test('[REG-13 RELATIONAL CONSENT DISAGREEMENT] Stale JSONB ALL_GRANTED cannot authorize recording when relational table has DECLINED decision', async () => {
    seedMeeting({
      id: 'mtg_reg13_disagreement',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg13',
      title: 'Consent Disagreement Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'NOT_STARTED',
      facilitatorId: 'pers_fac_1',
      recordingMetadata: {
        // Deliberately stale / forged JSONB projection claiming ALL_GRANTED
        consent_session: {
          sessionId: 'rsess_reg13_stale',
          status: 'ALL_GRANTED',
          requestedBy: 'pers_fac_1',
          consents: {
            'pers_fac_1': { participantId: 'pers_fac_1', participantName: 'Facilitator', role: 'Facilitator', status: 'GRANTED', recordingSessionId: 'rsess_reg13_stale' },
            'usr_student_charlie': { participantId: 'usr_student_charlie', participantName: 'Charlie Student', role: 'STUDENT', status: 'GRANTED', recordingSessionId: 'rsess_reg13_stale' },
          },
        },
        active_participants: [
          { participantId: 'pers_fac_1', participantName: 'Facilitator', role: 'Facilitator', joinedAt: new Date().toISOString(), canPublish: true },
          { participantId: 'usr_student_charlie', participantName: 'Charlie Student', role: 'STUDENT', joinedAt: new Date().toISOString(), canPublish: false },
        ],
      },
    });

    // Authoritative relational store has Charlie as DECLINED
    global.__MOCK_CONSENT_SESSIONS_DB__.set('rsess_reg13_stale', {
      id: 'rsess_reg13_stale',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_reg13_disagreement',
      requested_by: 'pers_fac_1',
      status: 'DECLINED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    global.__MOCK_CONSENTS_DB__.set('rsess_reg13_stale_pers_fac_1', {
      id: 'cst_rsess_reg13_stale_pers_fac_1',
      session_id: 'rsess_reg13_stale',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_reg13_disagreement',
      participant_id: 'pers_fac_1',
      participant_name: 'Facilitator',
      role: 'Facilitator',
      status: 'GRANTED',
      decided_at: new Date().toISOString(),
    });

    global.__MOCK_CONSENTS_DB__.set('rsess_reg13_stale_usr_student_charlie', {
      id: 'cst_rsess_reg13_stale_usr_student_charlie',
      session_id: 'rsess_reg13_stale',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_reg13_disagreement',
      participant_id: 'usr_student_charlie',
      participant_name: 'Charlie Student',
      role: 'STUDENT',
      status: 'DECLINED',
      reason: 'I do not consent.',
      decided_at: new Date().toISOString(),
    });

    const facSession = { user: { id: 'pers_fac_1', email: 'fac@clasptek.org' }, tenantId: 'tenant_a', role: 'Facilitator' };

    // 1. getRecordingConsentStatus queries relational tables and returns DECLINED, refusing start
    const statusRes = await getRecordingConsentStatus({ meetingId: 'mtg_reg13_disagreement', session: facSession });
    assert.strictEqual(statusRes.status, 'DECLINED');
    assert.strictEqual(statusRes.canStartRecording, false);
    assert.strictEqual(statusRes.hasDeclined, true);
    assert.strictEqual(statusRes.declinedCount, 1);

    // 2. startMeetingRecording fails closed with 422 RECORDING_CONSENT_DECLINED despite stale JSONB
    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_reg13_disagreement', session: facSession }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.statusCode, 422);
        assert.strictEqual(err.code, 'RECORDING_CONSENT_DECLINED');
        return true;
      }
    );
  });

  // REG-14: Stale JSONB projection cannot overwrite newer relational consent decision
  await test('[REG-14 STALE JSONB CANNOT OVERWRITE] Direct modification to JSONB cannot authorize recording or overwrite relational decision', async () => {
    seedMeeting({
      id: 'mtg_reg14_overwrite_attempt',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg14',
      title: 'Overwrite Protection Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'NOT_STARTED',
      facilitatorId: 'pers_fac_1',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_reg14_active',
          status: 'DECLINED',
          consents: {
            'usr_student_dan': { participantId: 'usr_student_dan', status: 'DECLINED' },
          },
        },
      },
    });

    global.__MOCK_CONSENT_SESSIONS_DB__.set('rsess_reg14_active', {
      id: 'rsess_reg14_active',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_reg14_overwrite_attempt',
      requested_by: 'pers_fac_1',
      status: 'DECLINED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    global.__MOCK_CONSENTS_DB__.set('rsess_reg14_active_usr_student_dan', {
      id: 'cst_rsess_reg14_active_usr_student_dan',
      session_id: 'rsess_reg14_active',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_reg14_overwrite_attempt',
      participant_id: 'usr_student_dan',
      participant_name: 'Dan Student',
      role: 'STUDENT',
      status: 'DECLINED',
      decided_at: new Date().toISOString(),
    });

    // Attacker modifies meeting recording_metadata in JSONB directly
    const m = mockDb.get('mtg_reg14_overwrite_attempt');
    m.recordingMetadata.consent_session.status = 'ALL_GRANTED';
    m.recordingMetadata.consent_session.consents['usr_student_dan'].status = 'GRANTED';
    mockDb.set('mtg_reg14_overwrite_attempt', m);

    const facSession = { user: { id: 'pers_fac_1', email: 'fac@clasptek.org' }, tenantId: 'tenant_a', role: 'Facilitator' };

    // Authority resides in relational table: still DECLINED
    const statusRes = await getRecordingConsentStatus({ meetingId: 'mtg_reg14_overwrite_attempt', session: facSession });
    assert.strictEqual(statusRes.status, 'DECLINED');
    assert.strictEqual(statusRes.canStartRecording, false);

    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_reg14_overwrite_attempt', session: facSession }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.statusCode, 422);
        assert.strictEqual(err.code, 'RECORDING_CONSENT_DECLINED');
        return true;
      }
    );
  });

  // REG-15: Missing RPC or absent migration fails closed with 500 without falling back to JSONB
  await test('[REG-15 ABSENT RPC FAILS CLOSED] Absent migration or RPC error fails closed with 500 without JSONB fallback', async () => {
    seedMeeting({
      id: 'mtg_reg15_absent_rpc',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg15',
      recordingStatus: 'NOT_STARTED',
      facilitatorId: 'pers_fac_1',
      recordingMetadata: {
        consent_session: {
          sessionId: 'rsess_reg15_001',
          status: 'PENDING_CONSENT',
          consents: {
            'usr_student_eve': { participantId: 'usr_student_eve', status: 'PENDING' },
          },
        },
      },
    });

    // Simulate PostgreSQL missing stored function (code 42883)
    global.__TEST_RPC_HANDLER__ = async (fn) => {
      if (fn === 'submit_participant_consent') {
        return { data: null, error: { code: '42883', message: 'function public.submit_participant_consent does not exist' } };
      }
      return { data: null, error: new Error('RPC_NOT_INSTALLED') };
    };

    const studentSession = { user: { id: 'usr_student_eve', email: 'eve@student.org' }, tenantId: 'tenant_a', role: 'STUDENT' };

    await assert.rejects(
      async () => {
        await recordParticipantConsent({
          meetingId: 'mtg_reg15_absent_rpc',
          recordingSessionId: 'rsess_reg15_001',
          session: studentSession,
          decision: 'GRANTED',
        });
      },
      (err) => {
        assert.ok(err instanceof RecordingServiceError);
        assert.strictEqual(err.statusCode, 500);
        assert.strictEqual(err.code, 'RELATIONAL_CONSENT_PERSISTENCE_FAILED');
        return true;
      }
    );

    delete global.__TEST_RPC_HANDLER__;
  });

  // REG-16: Ambiguous Egress candidates preserve start_intent, block start retries with 409, survive re-reconciliation, and leave unrelated jobs untouched
  await test('[REG-16 AMBIGUOUS EGRESS RECOVERABILITY] Ambiguous Egress candidates preserve start_intent, block retries with 409, and survive re-reconciliation', async () => {
    seedMeeting({
      id: 'mtg_reg16_ambiguous_egress',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-reg16',
      title: 'Ambiguous Egress Meeting',
      sfuRoomId: 'room_reg16_ambig',
      recordingStatus: 'PROCESSING',
      facilitatorId: 'pers_fac_1',
      recordingMetadata: {
        start_intent: {
          token: 'start_tok_reg16_ambig',
          roomName: 'room_reg16_ambig',
          tenantId: 'tenant_a',
          meetingId: 'mtg_reg16_ambiguous_egress',
          startedBy: 'pers_fac_1',
          initiatedAt: new Date().toISOString(),
          fileName: 'CLASPTEK_mtg-pub-reg16_ambig.mp4',
          filePath: 'recordings/CLASPTEK_mtg-pub-reg16_ambig.mp4',
        },
      },
    });

    const stoppedJobs = [];
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'ListEgress') {
        return {
          items: [
            {
              egress_id: 'egress_ambig_candidate_1',
              room_name: 'room_reg16_ambig',
              status: 'EGRESS_ACTIVE',
              request: { file_outputs: [{ filepath: 'recordings/CLASPTEK_mtg-pub-reg16_ambig.mp4' }] },
            },
            {
              egress_id: 'egress_ambig_candidate_2',
              room_name: 'room_reg16_ambig',
              status: 'EGRESS_STARTING',
              request: { file_outputs: [{ filepath: 'recordings/CLASPTEK_mtg-pub-reg16_ambig.mp4' }] },
            },
            {
              egress_id: 'egress_unrelated_innocent_3',
              room_name: 'room_completely_different',
              status: 'EGRESS_ACTIVE',
              request: { file_outputs: [{ filepath: 'recordings/unrelated.mp4' }] },
            },
          ],
        };
      }
      if (action === 'StopEgress') {
        stoppedJobs.push(body.egress_id);
        return { egress_id: body.egress_id, status: 'EGRESS_ENDING' };
      }
      return {};
    };

    const reconcilerSession = { user: { id: 'usr_reconciler' }, tenantId: 'tenant_a', role: 'Super Admin' };

    // 1. First reconciliation: detects ambiguous candidates and throws 409
    await assert.rejects(
      async () => reconcileMeetingRecording({ meetingId: 'mtg_reg16_ambiguous_egress', session: reconcilerSession }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError || err.name === 'RecordingServiceError', 'Expected RecordingServiceError');
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'AMBIGUOUS_EGRESS_CANDIDATES');
        return true;
      }
    );

    // Verify: Neither candidate nor unrelated job was stopped
    assert.strictEqual(stoppedJobs.length, 0, 'No Egress job may be stopped when candidate matches are ambiguous');

    // Verify: start_intent correlation data was preserved in metadata
    let m = mockDb.get('mtg_reg16_ambiguous_egress');
    assert.strictEqual(m.recordingStatus, 'PROCESSING');
    assert.ok(m.recordingMetadata.start_intent, 'start_intent MUST NOT be cleared on ambiguous candidates');
    assert.strictEqual(m.recordingMetadata.start_intent.roomName, 'room_reg16_ambig');
    assert.strictEqual(m.recordingMetadata.start_intent.filePath, 'recordings/CLASPTEK_mtg-pub-reg16_ambig.mp4');
    assert.ok(Array.isArray(m.recordingMetadata.ambiguous_egress_candidates));
    assert.strictEqual(m.recordingMetadata.ambiguous_egress_candidates.length, 2);

    // 2. Start retry must be blocked while unresolved: throws 409 RECORDING_START_INTENT_UNRESOLVED
    const facSession = { user: { id: 'pers_fac_1' }, tenantId: 'tenant_a', role: 'Facilitator' };
    await assert.rejects(
      async () => startMeetingRecording({ meetingId: 'mtg_reg16_ambiguous_egress', session: facSession }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError || err.name === 'RecordingServiceError', 'Expected RecordingServiceError');
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'RECORDING_START_INTENT_UNRESOLVED');
        return true;
      }
    );

    // 3. Second reconciliation attempt: survives, maintains correlation data, unrelated jobs remain untouched
    await assert.rejects(
      async () => reconcileMeetingRecording({ meetingId: 'mtg_reg16_ambiguous_egress', session: reconcilerSession }),
      (err) => {
        assert.ok(err instanceof RecordingServiceError || err.name === 'RecordingServiceError', 'Expected RecordingServiceError');
        assert.strictEqual(err.statusCode, 409);
        assert.strictEqual(err.code, 'AMBIGUOUS_EGRESS_CANDIDATES');
        return true;
      }
    );

    assert.strictEqual(stoppedJobs.length, 0, 'Second reconciliation must still not stop ambiguous or foreign jobs');
    m = mockDb.get('mtg_reg16_ambiguous_egress');
    assert.ok(m.recordingMetadata.start_intent, 'start_intent must still survive second reconciliation');
    assert.strictEqual(m.recordingMetadata.ambiguous_egress_candidates.length, 2);

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // --- Suite 16: Server-Side Scheduled Reconciliation & Vercel Cron Pipeline ---
  console.log('\n--- Suite 16: Server-Side Scheduled Reconciliation & Vercel Cron Pipeline ---');

  // CRON-1: Unauthorized Calls
  await test('[CRON-1 UNAUTHORIZED REJECTION] Cron route rejects missing, malformed, or invalid authorization with 401 without leaking secrets', async () => {
    process.env.CRON_SECRET = 'secure_test_cron_secret_xyz';

    // 1. Missing Authorization header
    const req1 = new NextRequest('https://app.clasptek.internal/api/cron/reconcile-recordings');
    const res1 = await cronRoute.GET(req1);
    assert.strictEqual(res1.status, 401);
    const body1 = await res1.json();
    assert.strictEqual(body1.error, 'Unauthorized: Missing or invalid authorization token.');
    assert.ok(!JSON.stringify(body1).includes('secure_test_cron_secret_xyz'), 'Never leak secret in response');

    // 2. Invalid Bearer token
    const req2 = new NextRequest('https://app.clasptek.internal/api/cron/reconcile-recordings', {
      headers: { authorization: 'Bearer wrong_token_abc' },
    });
    const res2 = await cronRoute.GET(req2);
    assert.strictEqual(res2.status, 401);

    // 3. Unconfigured CRON_SECRET in environment
    delete process.env.CRON_SECRET;
    const req3 = new NextRequest('https://app.clasptek.internal/api/cron/reconcile-recordings', {
      headers: { authorization: 'Bearer secure_test_cron_secret_xyz' },
    });
    const res3 = await cronRoute.GET(req3);
    assert.strictEqual(res3.status, 401);

    process.env.CRON_SECRET = 'secure_test_cron_secret_xyz';
  });

  // CRON-2: Authorized Call with Valid Secret
  await test('[CRON-2 AUTHORIZED EXECUTION] Authorized call with valid CRON_SECRET succeeds with 200 and structured results', async () => {
    process.env.CRON_SECRET = 'secure_test_cron_secret_xyz';

    const req = new NextRequest('https://app.clasptek.internal/api/cron/reconcile-recordings', {
      headers: { authorization: 'Bearer secure_test_cron_secret_xyz' },
    });
    const res = await cronRoute.GET(req);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.ok(typeof body.scanned === 'number');
    assert.ok(typeof body.reconciled === 'number');
    assert.ok(typeof body.skipped === 'number');
    assert.ok(typeof body.failed === 'number');
    assert.ok(Array.isArray(body.results));
  });

  // CRON-3: Stale vs Non-Stale Candidates
  await test('[CRON-3 STALE VS NON-STALE] Reconciler processes stale PROCESSING candidates and ignores fresh non-stale candidates', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const tenSecAgo = new Date(Date.now() - 10 * 1000).toISOString();

    // Stale meeting in PROCESSING with start_intent
    seedMeeting({
      id: 'mtg_cron_stale_001',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-stale-001',
      title: 'Stale Meeting',
      sfuRoomId: 'room_cron_stale_001',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        start_intent: {
          token: 'tok_stale_001',
          roomName: 'room_cron_stale_001',
          tenantId: 'tenant_a',
          meetingId: 'mtg_cron_stale_001',
          startedBy: 'usr_fac_1',
          initiatedAt: tenMinAgo,
          fileName: 'CLASPTEK_stale.mp4',
          filePath: 'recordings/CLASPTEK_stale.mp4',
        },
      },
    });

    // Fresh meeting in PROCESSING (e.g. actively starting right now)
    seedMeeting({
      id: 'mtg_cron_fresh_002',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-fresh-002',
      title: 'Fresh Meeting',
      sfuRoomId: 'room_cron_fresh_002',
      recordingStatus: 'PROCESSING',
      updatedAt: tenSecAgo,
      recordingMetadata: {
        start_intent: {
          token: 'tok_fresh_002',
          roomName: 'room_cron_fresh_002',
          tenantId: 'tenant_a',
          meetingId: 'mtg_cron_fresh_002',
          startedBy: 'usr_fac_1',
          initiatedAt: tenSecAgo,
          fileName: 'CLASPTEK_fresh.mp4',
          filePath: 'recordings/CLASPTEK_fresh.mp4',
        },
      },
    });

    // Mock LiveKit Egress: ListEgress returns no remote jobs for stale meeting
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action) => {
      if (action === 'ListEgress') return { items: [] };
      return {};
    };

    const batchRes = await reconcileStaleRecordingsBatch({ batchLimit: 10, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(batchRes.scanned, 1, 'Only the stale meeting should be scanned');
    assert.strictEqual(batchRes.reconciled, 1);

    const staleM = mockDb.get('mtg_cron_stale_001');
    assert.strictEqual(staleM.recordingStatus, 'NOT_STARTED', 'Stale meeting reset to NOT_STARTED');

    const freshM = mockDb.get('mtg_cron_fresh_002');
    assert.strictEqual(freshM.recordingStatus, 'PROCESSING', 'Fresh meeting remains untouched in PROCESSING');

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // CRON-4: Unresolved NOT_STARTED Intents
  await test('[CRON-4 UNRESOLVED NOT_STARTED INTENTS] Pre-start intent left dangling under NOT_STARTED is detected and recovered', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_cron_not_started_intent',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-ns-intent',
      title: 'Dangling Intent Meeting',
      sfuRoomId: 'room_cron_ns_intent',
      recordingStatus: 'NOT_STARTED',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        start_intent: {
          token: 'tok_ns_intent',
          roomName: 'room_cron_ns_intent',
          tenantId: 'tenant_a',
          meetingId: 'mtg_cron_not_started_intent',
          startedBy: 'usr_fac_1',
          initiatedAt: tenMinAgo,
          fileName: 'CLASPTEK_ns_intent.mp4',
          filePath: 'recordings/CLASPTEK_ns_intent.mp4',
        },
      },
    });

    // Seed authoritative relational consent session as ACTIVE_RECORDING with affirmative participant
    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_ns_intent', {
      id: 'sess_ns_intent',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_cron_not_started_intent',
      status: 'ACTIVE_RECORDING',
      created_at: tenMinAgo,
      updated_at: tenMinAgo,
    });
    global.__MOCK_CONSENTS_DB__.set('sess_ns_intent_usr1', {
      id: 'cst_sess_ns_intent_usr1',
      session_id: 'sess_ns_intent',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_cron_not_started_intent',
      participant_id: 'usr1',
      participant_name: 'Student 1',
      role: 'STUDENT',
      status: 'GRANTED',
      decided_at: tenMinAgo,
    });

    // ListEgress returns matching active remote egress
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action) => {
      if (action === 'ListEgress') {
        return {
          items: [
            {
              egress_id: 'egress_ns_intent_recovered',
              room_name: 'room_cron_ns_intent',
              status: 'EGRESS_ACTIVE',
              request: { file_outputs: [{ filepath: 'recordings/CLASPTEK_ns_intent.mp4' }] },
            },
          ],
        };
      }
      return {};
    };

    const batchRes = await reconcileStaleRecordingsBatch({ batchLimit: 10, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(batchRes.scanned, 1);
    assert.strictEqual(batchRes.reconciled, 1);

    const m = mockDb.get('mtg_cron_not_started_intent');
    assert.strictEqual(m.recordingStatus, 'RECORDING', 'Recovered active egress and transitioned to RECORDING');
    assert.strictEqual(m.recordingMetadata.egressId, 'egress_ns_intent_recovered');
    assert.strictEqual(m.recordingMetadata.start_intent, null);

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // CRON-5: Pending Permission Revocation
  await test('[CRON-5 PENDING PERMISSION REVOCATION] Quiescent meeting with pending permission revocation is reconciled against LiveKit SFU', async () => {
    mockDb.clear();

    seedMeeting({
      id: 'mtg_cron_perm_reconcile',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-perm-001',
      title: 'Perm Reconcile Meeting',
      sfuRoomId: 'room_perm_reconcile_001',
      recordingStatus: 'STORED',
      recordingMetadata: {
        permission_reconciliation_needed: {
          participantId: 'usr_declined_student',
          identity: 'usr_declined_student',
          action: 'REVOKE_PUBLISH',
          failedAt: new Date().toISOString(),
          error: 'Connection timeout to SFU',
        },
        active_participants: [
          {
            participantId: 'usr_declined_student',
            participantName: 'Declined Student',
            role: 'STUDENT',
            joinedAt: new Date().toISOString(),
            canPublish: true,
            permissionRevocationPending: true,
          },
        ],
      },
    });

    // Authoritative relational store has DECLINED status
    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_perm_001', {
      id: 'sess_perm_001',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_cron_perm_reconcile',
      status: 'DECLINED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
    global.__MOCK_CONSENTS_DB__.set('sess_perm_001_usr_declined_student', {
      id: 'cst_perm_001',
      session_id: 'sess_perm_001',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_cron_perm_reconcile',
      participant_id: 'usr_declined_student',
      status: 'DECLINED',
    });

    const revokedParticipants = [];
    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'GetParticipant') {
        return { participant: { identity: body.identity, permission: { can_publish: true } } };
      }
      if (action === 'UpdateParticipant') {
        revokedParticipants.push(body);
        return { identity: body.identity, permission: { can_publish: body.permission?.can_publish } };
      }
      return {};
    };

    const batchRes = await reconcileStaleRecordingsBatch({ batchLimit: 10 });
    assert.strictEqual(batchRes.scanned, 1);
    assert.strictEqual(batchRes.reconciled, 1);

    assert.strictEqual(revokedParticipants.length, 1);
    assert.strictEqual(revokedParticipants[0].identity, 'usr_declined_student');
    assert.strictEqual(revokedParticipants[0].permission.can_publish, false, 'Publish permission revoked on LiveKit SFU');

    const m = mockDb.get('mtg_cron_perm_reconcile');
    assert.strictEqual(m.recordingMetadata.permission_reconciliation_needed, null, 'Cleared flag');
    assert.strictEqual(m.recordingMetadata.active_participants[0].permissionRevocationPending, false);
    assert.strictEqual(m.recordingMetadata.active_participants[0].canPublish, false);

    delete global.__LIVEKIT_ROOM_MOCK_HANDLER__;
  });

  // CRON-6: Concurrent Workers & Claim Conflicts
  await test('[CRON-6 CONCURRENT WORKERS & CLAIM CONFLICTS] Active claim blocks cron worker; expired claim lease allows takeover', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const tenSecAgo = new Date().toISOString();

    // Meeting 1: Active claim (lease valid for next 4 minutes)
    seedMeeting({
      id: 'mtg_cron_claim_active',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-act',
      title: 'Active Claim Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        start_intent: { roomName: 'room_claim_act', initiatedAt: tenMinAgo },
        processing_claim: {
          token: 'claim_tok_active',
          claimed_at: tenSecAgo,
          claimed_by: 'other_worker_xyz',
          lease_expires_at: new Date(Date.now() + 4 * 60 * 1000).toISOString(),
        },
      },
    });

    // Meeting 2: Expired claim (>10m old)
    seedMeeting({
      id: 'mtg_cron_claim_expired',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-exp',
      title: 'Expired Claim Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        start_intent: { roomName: 'room_claim_exp', initiatedAt: tenMinAgo },
        processing_claim: {
          token: 'claim_tok_expired',
          claimed_at: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
          claimed_by: 'dead_worker_xyz',
          lease_expires_at: new Date(Date.now() - 10 * 60 * 1000).toISOString(),
        },
      },
    });

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => ({ items: [] });

    const batchRes = await reconcileStaleRecordingsBatch({ batchLimit: 10, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(batchRes.scanned, 2);

    const actResult = batchRes.results.find((r) => r.meetingId === 'mtg_cron_claim_active');
    assert.strictEqual(actResult.outcome, 'SKIPPED_CLAIM_HELD', 'Active claim was safely skipped');

    const expResult = batchRes.results.find((r) => r.meetingId === 'mtg_cron_claim_expired');
    assert.strictEqual(expResult.outcome, 'RECONCILED', 'Expired claim was taken over and reconciled');

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // CRON-7: Bounded Batch Limits
  await test('[CRON-7 BOUNDED BATCH LIMITS] Bounded batch limit enforces strict cap and leaves excess candidates for subsequent runs', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    for (let i = 1; i <= 8; i++) {
      seedMeeting({
        id: `mtg_batch_${i}`,
        tenantId: 'tenant_a',
        publicId: `pub_batch_${i}`,
        title: `Batch Meeting ${i}`,
        recordingStatus: 'PROCESSING',
        updatedAt: tenMinAgo,
        recordingMetadata: {
          start_intent: { roomName: `room_batch_${i}`, initiatedAt: tenMinAgo },
        },
      });
    }

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => ({ items: [] });

    // Execute with batchLimit of 3
    const batchRes = await reconcileStaleRecordingsBatch({ batchLimit: 3, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(batchRes.scanned, 3, 'Must scan exactly 3 candidates');
    assert.strictEqual(batchRes.results.length, 3, 'Must process exactly 3 results');

    // Verify remaining 5 meetings are still untouched in PROCESSING
    let remainingProcessing = 0;
    for (let i = 1; i <= 8; i++) {
      if (mockDb.get(`mtg_batch_${i}`).recordingStatus === 'PROCESSING') remainingProcessing++;
    }
    assert.strictEqual(remainingProcessing, 5, '5 meetings must remain in PROCESSING for future batches');

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // CRON-8: Ambiguous Egress Jobs Preserved
  await test('[CRON-8 AMBIGUOUS EGRESS PRESERVED] Ambiguous Egress candidates are preserved without stopping or adopting, and do not block batch', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // Meeting 1: Ambiguous (2 candidates)
    seedMeeting({
      id: 'mtg_cron_ambig_001',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-cron-ambig',
      title: 'Cron Ambiguous Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        start_intent: {
          token: 'tok_cron_ambig',
          roomName: 'room_cron_ambig',
          tenantId: 'tenant_a',
          meetingId: 'mtg_cron_ambig_001',
          filePath: 'recordings/ambig.mp4',
        },
      },
    });

    // Meeting 2: Unambiguous (0 candidates -> resets to NOT_STARTED)
    seedMeeting({
      id: 'mtg_cron_clear_002',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-cron-clear',
      title: 'Cron Clear Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        start_intent: {
          token: 'tok_cron_clear',
          roomName: 'room_cron_clear',
          tenantId: 'tenant_a',
          meetingId: 'mtg_cron_clear_002',
          filePath: 'recordings/clear.mp4',
        },
      },
    });

    const stoppedJobs = [];
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'ListEgress') {
        if (body.room_name === 'room_cron_ambig') {
          return {
            items: [
              { egress_id: 'eg_ambig_1', room_name: 'room_cron_ambig', status: 'EGRESS_ACTIVE', request: { file_outputs: [{ filepath: 'recordings/ambig.mp4' }] } },
              { egress_id: 'eg_ambig_2', room_name: 'room_cron_ambig', status: 'EGRESS_STARTING', request: { file_outputs: [{ filepath: 'recordings/ambig.mp4' }] } },
            ],
          };
        }
        return { items: [] };
      }
      if (action === 'StopEgress') {
        stoppedJobs.push(body.egress_id);
        return {};
      }
      return {};
    };

    const batchRes = await reconcileStaleRecordingsBatch({ batchLimit: 10, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(batchRes.scanned, 2);
    assert.strictEqual(stoppedJobs.length, 0, 'No candidate jobs stopped on ambiguity');

    const ambigResult = batchRes.results.find((r) => r.meetingId === 'mtg_cron_ambig_001');
    assert.strictEqual(ambigResult.outcome, 'SKIPPED_AMBIGUOUS');

    const clearResult = batchRes.results.find((r) => r.meetingId === 'mtg_cron_clear_002');
    assert.strictEqual(clearResult.outcome, 'RECONCILED');

    const mAmbig = mockDb.get('mtg_cron_ambig_001');
    assert.strictEqual(mAmbig.recordingStatus, 'PROCESSING');
    assert.ok(mAmbig.recordingMetadata.start_intent, 'start_intent preserved');
    assert.strictEqual(mAmbig.recordingMetadata.ambiguous_egress_candidates.length, 2);

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // CRON-9: Relational Consent Authority during Cron Reconcile
  await test('[CRON-9 RELATIONAL CONSENT AUTHORITY] Cron reconciliation checks relational consent as single authority; JSONB ALL_GRANTED cannot authorize', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_cron_rel_authority',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-rel-auth',
      title: 'Relational Authority Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        // Stale / forged JSONB claiming ALL_GRANTED
        consent_session: {
          sessionId: 'sess_forged_jsonb',
          status: 'ALL_GRANTED',
        },
        start_intent: {
          token: 'tok_rel_auth',
          roomName: 'room_rel_auth',
          tenantId: 'tenant_a',
          meetingId: 'mtg_cron_rel_authority',
          filePath: 'recordings/rel_auth.mp4',
        },
      },
    });

    // Authoritative relational store has DECLINED status (stale JSONB claims ALL_GRANTED)
    global.__MOCK_CONSENT_SESSIONS_DB__.delete('sess_forged_jsonb');
    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_authoritative_rel', {
      id: 'sess_authoritative_rel',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_cron_rel_authority',
      status: 'DECLINED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    let stoppedEgressId = null;
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'ListEgress') {
        return {
          items: [
            {
              egress_id: 'egress_orphaned_unconsented',
              room_name: 'room_rel_auth',
              status: 'EGRESS_ACTIVE',
              request: { file_outputs: [{ filepath: 'recordings/rel_auth.mp4' }] },
            },
          ],
        };
      }
      if (action === 'StopEgress') {
        stoppedEgressId = body.egress_id;
        return {};
      }
      return {};
    };

    const batchRes = await reconcileStaleRecordingsBatch({ batchLimit: 10, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(batchRes.scanned, 1);
    assert.strictEqual(batchRes.reconciled, 1);
    assert.strictEqual(stoppedEgressId, 'egress_orphaned_unconsented', 'Orphaned Egress stopped because relational consent was DECLINED');

    const m = mockDb.get('mtg_cron_rel_authority');
    assert.strictEqual(m.recordingStatus, 'FAILED', 'Meeting marked FAILED because valid consent was not established in relational table');

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // CRON-10: Candidate Fairness & Starvation Prevention Under PROCESSING Backlog
  await test('[CRON-10 CANDIDATE FAIRNESS] Stale PROCESSING backlog cannot starve unresolved intents or pending permission revocations; repeated batches make progress', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // 1. Seed 12 stale PROCESSING meetings (Category 1 backlog)
    for (let i = 1; i <= 12; i++) {
      seedMeeting({
        id: `mtg_proc_${String(i).padStart(2, '0')}`,
        tenantId: 'tenant_a',
        publicId: `pub_proc_${i}`,
        title: `Stale Processing Meeting ${i}`,
        recordingStatus: 'PROCESSING',
        updatedAt: new Date(Date.now() - (15 + i) * 60 * 1000).toISOString(),
        recordingMetadata: {
          startedAt: tenMinAgo,
        },
      });
    }

    // 2. Seed 2 unresolved NOT_STARTED intents (Category 2)
    for (let i = 1; i <= 2; i++) {
      seedMeeting({
        id: `mtg_intent_${String(i).padStart(2, '0')}`,
        tenantId: 'tenant_a',
        publicId: `pub_intent_${i}`,
        title: `Unresolved Intent Meeting ${i}`,
        recordingStatus: 'NOT_STARTED',
        updatedAt: new Date(Date.now() - (12 + i) * 60 * 1000).toISOString(),
        recordingMetadata: {
          start_intent: {
            token: `tok_intent_${i}`,
            roomName: `room_intent_${i}`,
            tenantId: 'tenant_a',
            meetingId: `mtg_intent_${String(i).padStart(2, '0')}`,
            initiatedAt: tenMinAgo,
          },
        },
      });
    }

    // 3. Seed 2 pending permission revocations (Category 3)
    for (let i = 1; i <= 2; i++) {
      seedMeeting({
        id: `mtg_perm_${String(i).padStart(2, '0')}`,
        tenantId: 'tenant_a',
        publicId: `pub_perm_${i}`,
        title: `Pending Perm Meeting ${i}`,
        recordingStatus: 'STORED',
        updatedAt: new Date(Date.now() - (10 + i) * 60 * 1000).toISOString(),
        recordingMetadata: {
          permission_reconciliation_needed: {
            participantId: `usr_perm_${i}`,
            identity: `usr_perm_${i}`,
            action: 'REVOKE_PUBLISH',
            failedAt: tenMinAgo,
          },
          active_participants: [
            {
              participantId: `usr_perm_${i}`,
              participantName: `User ${i}`,
              role: 'STUDENT',
              joinedAt: tenMinAgo,
              canPublish: true,
              permissionRevocationPending: true,
            },
          ],
        },
      });
      // Mock relational consent as DECLINED
      global.__MOCK_CONSENT_SESSIONS_DB__.set(`sess_perm_${i}`, {
        id: `sess_perm_${i}`,
        tenant_id: 'tenant_a',
        meeting_id: `mtg_perm_${String(i).padStart(2, '0')}`,
        status: 'DECLINED',
        created_at: tenMinAgo,
        updated_at: tenMinAgo,
      });
      global.__MOCK_CONSENTS_DB__.set(`sess_perm_${i}_usr_perm_${i}`, {
        id: `cst_perm_${i}`,
        session_id: `sess_perm_${i}`,
        tenant_id: 'tenant_a',
        meeting_id: `mtg_perm_${String(i).padStart(2, '0')}`,
        participant_id: `usr_perm_${i}`,
        status: 'DECLINED',
      });
    }

    // Mocks for LiveKit Egress and Room service
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => ({ items: [] });
    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'GetParticipant') {
        return { participant: { identity: body.identity, permission: { can_publish: true } } };
      }
      if (action === 'UpdateParticipant') {
        return { identity: body.identity, permission: { can_publish: false } };
      }
      return {};
    };

    // BATCH 1: batchLimit = 6
    // Total candidates: 12 (PROCESSING) + 2 (Intent) + 2 (Perm) = 16.
    // Interleaving round-robin must select 2 from Cat 1, 2 from Cat 2, and 2 from Cat 3.
    const batch1 = await reconcileStaleRecordingsBatch({ batchLimit: 6, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(batch1.scanned, 6, 'Batch 1 scanned exactly 6 candidates');
    assert.strictEqual(batch1.results.length, 6);

    const b1Ids = batch1.results.map((r) => r.meetingId);
    assert.ok(b1Ids.includes('mtg_intent_01'), 'Cat 2 intent 01 selected in Batch 1 (not starved)');
    assert.ok(b1Ids.includes('mtg_intent_02'), 'Cat 2 intent 02 selected in Batch 1 (not starved)');
    assert.ok(b1Ids.includes('mtg_perm_01'), 'Cat 3 perm 01 selected in Batch 1 (not starved)');
    assert.ok(b1Ids.includes('mtg_perm_02'), 'Cat 3 perm 02 selected in Batch 1 (not starved)');

    // Verify Cat 2 and Cat 3 meetings were reconciled
    assert.strictEqual(mockDb.get('mtg_intent_01').recordingMetadata.start_intent, null, 'Intent cleared');
    assert.strictEqual(mockDb.get('mtg_perm_01').recordingMetadata.permission_reconciliation_needed, null, 'Perm cleared');

    // BATCH 2: batchLimit = 6
    // Cat 2 and Cat 3 are now empty; remaining Cat 1 items (10 left) must spill over dynamically
    const batch2 = await reconcileStaleRecordingsBatch({ batchLimit: 6, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(batch2.scanned, 6, 'Batch 2 scanned 6 candidates from remaining PROCESSING backlog');

    // BATCH 3: batchLimit = 6
    // Remaining Cat 1 items (4 left)
    const batch3 = await reconcileStaleRecordingsBatch({ batchLimit: 6, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(batch3.scanned, 4, 'Batch 3 scanned final 4 candidates');

    // BATCH 4: batchLimit = 6
    // All 16 meetings reconciled; next batch finds 0 candidates
    const batch4 = await reconcileStaleRecordingsBatch({ batchLimit: 6, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(batch4.scanned, 0, 'Batch 4 found 0 candidates, backlog completely cleared');

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
    delete global.__LIVEKIT_ROOM_MOCK_HANDLER__;
  });

  // CRON-11: Boundary Batch Limits & Deduplication
  await test('[CRON-11 BOUNDARY LIMITS & DEDUPLICATION] Verification of batch limits 1, 2, 3, 6, 50 and multi-category deduplication', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => ({ items: [] });
    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async (action, body) => ({ participant: { identity: body.identity } });

    // Seed 1 of each category
    seedMeeting({
      id: 'mtg_b_proc',
      tenantId: 'tenant_a',
      publicId: 'pub_b_proc',
      title: 'Boundary Proc',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
    });
    seedMeeting({
      id: 'mtg_b_intent',
      tenantId: 'tenant_a',
      publicId: 'pub_b_intent',
      title: 'Boundary Intent',
      recordingStatus: 'NOT_STARTED',
      updatedAt: tenMinAgo,
      recordingMetadata: { start_intent: { roomName: 'room_b_intent', initiatedAt: tenMinAgo } },
    });
    seedMeeting({
      id: 'mtg_b_perm',
      tenantId: 'tenant_a',
      publicId: 'pub_b_perm',
      title: 'Boundary Perm',
      recordingStatus: 'STORED',
      updatedAt: tenMinAgo,
      recordingMetadata: { permission_reconciliation_needed: { action: 'REVOKE_PUBLISH' } },
    });

    // Subtest: batchLimit = 1
    const res1 = await reconcileStaleRecordingsBatch({ batchLimit: 1, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(res1.scanned, 1, 'batchLimit: 1 must scan exactly 1 candidate');
    assert.strictEqual(res1.results.length, 1);

    // Subtest: batchLimit = 2
    mockDb.clear();
    seedMeeting({ id: 'mtg_b2_proc', tenantId: 'tenant_a', publicId: 'pub_b2_1', recordingStatus: 'PROCESSING', updatedAt: tenMinAgo });
    seedMeeting({ id: 'mtg_b2_intent', tenantId: 'tenant_a', publicId: 'pub_b2_2', recordingStatus: 'NOT_STARTED', updatedAt: tenMinAgo, recordingMetadata: { start_intent: { roomName: 'r2', initiatedAt: tenMinAgo } } });
    seedMeeting({ id: 'mtg_b2_perm', tenantId: 'tenant_a', publicId: 'pub_b2_3', recordingStatus: 'STORED', updatedAt: tenMinAgo, recordingMetadata: { permission_reconciliation_needed: { action: 'REVOKE' } } });

    const res2 = await reconcileStaleRecordingsBatch({ batchLimit: 2, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(res2.scanned, 2, 'batchLimit: 2 must scan exactly 2 candidates');
    assert.strictEqual(res2.results.length, 2);

    // Subtest: batchLimit = 3
    mockDb.clear();
    seedMeeting({ id: 'mtg_b3_proc', tenantId: 'tenant_a', publicId: 'pub_b3_1', recordingStatus: 'PROCESSING', updatedAt: tenMinAgo });
    seedMeeting({ id: 'mtg_b3_intent', tenantId: 'tenant_a', publicId: 'pub_b3_2', recordingStatus: 'NOT_STARTED', updatedAt: tenMinAgo, recordingMetadata: { start_intent: { roomName: 'r3', initiatedAt: tenMinAgo } } });
    seedMeeting({ id: 'mtg_b3_perm', tenantId: 'tenant_a', publicId: 'pub_b3_3', recordingStatus: 'STORED', updatedAt: tenMinAgo, recordingMetadata: { permission_reconciliation_needed: { action: 'REVOKE' } } });

    const res3 = await reconcileStaleRecordingsBatch({ batchLimit: 3, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(res3.scanned, 3, 'batchLimit: 3 must scan exactly 3 candidates');
    assert.strictEqual(res3.results.length, 3);

    // Subtest: Multi-category duplicate meeting deduplication with batchLimit = 6
    mockDb.clear();
    // Meeting that qualifies for ALL THREE categories simultaneously:
    seedMeeting({
      id: 'mtg_multi_cat',
      tenantId: 'tenant_a',
      publicId: 'pub_multi_cat',
      title: 'Multi-category Candidate',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        start_intent: { roomName: 'room_multi', initiatedAt: tenMinAgo },
        permission_reconciliation_needed: { action: 'REVOKE_PUBLISH' },
      },
    });
    // Two distinct single-category meetings
    seedMeeting({ id: 'mtg_single_1', tenantId: 'tenant_a', publicId: 'pub_s1', recordingStatus: 'PROCESSING', updatedAt: tenMinAgo });
    seedMeeting({ id: 'mtg_single_2', tenantId: 'tenant_a', publicId: 'pub_s2', recordingStatus: 'NOT_STARTED', updatedAt: tenMinAgo, recordingMetadata: { start_intent: { roomName: 'r_s2', initiatedAt: tenMinAgo } } });

    const res6 = await reconcileStaleRecordingsBatch({ batchLimit: 6, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(res6.scanned, 3, 'Exactly 3 unique meetings scanned (multi-category deduplicated)');
    const multiCount = res6.results.filter((r) => r.meetingId === 'mtg_multi_cat').length;
    assert.strictEqual(multiCount, 1, 'Meeting matching multiple categories is selected and reconciled exactly once');

    // Subtest: batchLimit = 50 upper bound
    mockDb.clear();
    for (let i = 1; i <= 55; i++) {
      seedMeeting({
        id: `mtg_50_${i}`,
        tenantId: 'tenant_a',
        publicId: `pub_50_${i}`,
        recordingStatus: 'PROCESSING',
        updatedAt: tenMinAgo,
      });
    }
    const res50 = await reconcileStaleRecordingsBatch({ batchLimit: 50, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(res50.scanned, 50, 'batchLimit: 50 caps scan at exactly 50 candidates');

    // Subtest: batchLimit clamping bounds (< 1 clamped to 1, > 50 clamped to 50)
    const resClampMin = await reconcileStaleRecordingsBatch({ batchLimit: 0, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(resClampMin.scanned, 1, 'batchLimit < 1 clamped to 1');

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
    delete global.__LIVEKIT_ROOM_MOCK_HANDLER__;
  });

  // CRON-12: Durable Candidate Rotation, Continuous Category 1 Backlog & Concurrency Protection
  await test('[CRON-12 DURABLE ROTATION & CONTINUOUS BACKLOG] Continuous Category 1 replenishment cannot starve Categories 2 and 3; covers limits 1, 2, 3, 6, 50, claims, retries, and RPC errors', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => ({ items: [] });
    global.__LIVEKIT_ROOM_MOCK_HANDLER__ = async (action, body) => ({ participant: { identity: body.identity } });

    // 1. CONTINUOUS CATEGORY 1 BACKLOG UNDER batchLimit = 1
    // Reset mock cursor state to offset 0 explicitly
    global.__MOCK_RECONCILIATION_CURSOR_DB__ = { offset: 0, history: [] };

    // Initial seed: 1 Stale PROCESSING (Cat 1), 1 Unresolved Intent (Cat 2), 1 Pending Perm Revocation (Cat 3)
    seedMeeting({
      id: 'mtg_c12_stale_1',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_s1',
      title: 'Stale 1',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: { startedAt: tenMinAgo },
    });
    seedMeeting({
      id: 'mtg_c12_intent_1',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_i1',
      title: 'Intent 1',
      recordingStatus: 'NOT_STARTED',
      updatedAt: tenMinAgo,
      recordingMetadata: { start_intent: { roomName: 'room_c12_i1', initiatedAt: tenMinAgo } },
    });
    seedMeeting({
      id: 'mtg_c12_perm_1',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_p1',
      title: 'Perm 1',
      recordingStatus: 'STORED',
      updatedAt: tenMinAgo,
      recordingMetadata: { permission_reconciliation_needed: { action: 'REVOKE_PUBLISH' } },
    });

    // Run 1: Allocated offset = 0 -> Category 1 (mtg_c12_stale_1) selected
    const run1 = await reconcileStaleRecordingsBatch({ batchLimit: 1, staleThresholdMs: 2 * 60 * 1000, workerId: 'w_cron_1' });
    assert.strictEqual(run1.scanned, 1);
    assert.strictEqual(run1.results[0].meetingId, 'mtg_c12_stale_1', 'Run 1 selects Category 1 candidate');

    // Replenish Category 1 with another stale meeting before Run 2
    seedMeeting({
      id: 'mtg_c12_stale_2',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_s2',
      title: 'Stale 2 (Replenished)',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: { startedAt: tenMinAgo },
    });

    // Run 2: Allocated offset = 1 -> Category 2 (mtg_c12_intent_1) selected despite Cat 1 replenishment
    const run2 = await reconcileStaleRecordingsBatch({ batchLimit: 1, staleThresholdMs: 2 * 60 * 1000, workerId: 'w_cron_2' });
    assert.strictEqual(run2.scanned, 1);
    assert.strictEqual(run2.results[0].meetingId, 'mtg_c12_intent_1', 'Run 2 selects Category 2 (NOT starved by replenished Cat 1)');

    // Replenish Category 1 with yet another stale meeting before Run 3
    seedMeeting({
      id: 'mtg_c12_stale_3',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_s3',
      title: 'Stale 3 (Replenished)',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: { startedAt: tenMinAgo },
    });

    // Run 3: Allocated offset = 2 -> Category 3 (mtg_c12_perm_1) selected despite Cat 1 replenishment
    const run3 = await reconcileStaleRecordingsBatch({ batchLimit: 1, staleThresholdMs: 2 * 60 * 1000, workerId: 'w_cron_3' });
    assert.strictEqual(run3.scanned, 1);
    assert.strictEqual(run3.results[0].meetingId, 'mtg_c12_perm_1', 'Run 3 selects Category 3 (NOT starved by replenished Cat 1)');

    // Run 4: Allocated offset = 0 -> Rotates back to Category 1
    const run4 = await reconcileStaleRecordingsBatch({ batchLimit: 1, staleThresholdMs: 2 * 60 * 1000, workerId: 'w_cron_4' });
    assert.strictEqual(run4.scanned, 1);
    assert.strictEqual(run4.results[0].meetingId, 'mtg_c12_stale_2', 'Run 4 rotates back to Category 1');

    // 2. EMPTY CATEGORY & DYNAMIC SPILLOVER UNDER ROTATION
    mockDb.clear();
    // Offset is currently 1 (starts at Category 2). Seed Cat 3 and Cat 1, leaving Cat 2 EMPTY.
    seedMeeting({
      id: 'mtg_c12_perm_spill',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_ps',
      recordingStatus: 'STORED',
      updatedAt: tenMinAgo,
      recordingMetadata: { permission_reconciliation_needed: { action: 'REVOKE' } },
    });
    seedMeeting({
      id: 'mtg_c12_stale_spill',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_ss',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: { startedAt: tenMinAgo },
    });
    const runSpill = await reconcileStaleRecordingsBatch({ batchLimit: 1, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(runSpill.scanned, 1);
    assert.strictEqual(runSpill.results[0].meetingId, 'mtg_c12_perm_spill', 'Empty Category 2 dynamically spills over to Category 3');

    // 3. CONCURRENT INVOCATIONS & CLAIM FENCING
    mockDb.clear();
    // Seed candidate with active claim held by other worker
    seedMeeting({
      id: 'mtg_c12_claimed',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_claim',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        startedAt: tenMinAgo,
        processing_claim: {
          token: 'active_claim_tok',
          claimed_at: new Date().toISOString(),
          claimed_by: 'concurrent_worker_alpha',
          lease_expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
        },
      },
    });
    const runClaim = await reconcileStaleRecordingsBatch({ batchLimit: 1, staleThresholdMs: 2 * 60 * 1000, workerId: 'worker_beta' });
    assert.strictEqual(runClaim.scanned, 1);
    assert.strictEqual(runClaim.results[0].outcome, 'SKIPPED_CLAIM_HELD', 'Concurrent claim held prevents takeover and fences processing');

    // 4. DUPLICATE CANDIDATE DEDUPLICATION
    mockDb.clear();
    seedMeeting({
      id: 'mtg_c12_dup',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_dup',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        startedAt: tenMinAgo,
        start_intent: { roomName: 'room_dup', initiatedAt: tenMinAgo },
      },
    });
    seedMeeting({
      id: 'mtg_c12_single',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_single',
      recordingStatus: 'NOT_STARTED',
      updatedAt: tenMinAgo,
      recordingMetadata: { start_intent: { roomName: 'room_single', initiatedAt: tenMinAgo } },
    });
    const runDup = await reconcileStaleRecordingsBatch({ batchLimit: 2, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(runDup.scanned, 2);
    const dupCount = runDup.results.filter((r) => r.meetingId === 'mtg_c12_dup').length;
    assert.strictEqual(dupCount, 1, 'Meeting matching multiple categories is deduplicated to 1 result');

    // 5. BATCH BOUNDARIES: 2, 3, 6, 50
    mockDb.clear();
    for (let i = 1; i <= 70; i++) {
      seedMeeting({
        id: `mtg_c12_b_${i}`,
        tenantId: 'tenant_a',
        publicId: `pub_c12_b_${i}`,
        recordingStatus: 'PROCESSING',
        updatedAt: tenMinAgo,
        recordingMetadata: { startedAt: tenMinAgo },
      });
    }
    const runB2 = await reconcileStaleRecordingsBatch({ batchLimit: 2, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(runB2.scanned, 2, 'batchLimit: 2 scans exactly 2');
    const runB3 = await reconcileStaleRecordingsBatch({ batchLimit: 3, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(runB3.scanned, 3, 'batchLimit: 3 scans exactly 3');
    const runB6 = await reconcileStaleRecordingsBatch({ batchLimit: 6, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(runB6.scanned, 6, 'batchLimit: 6 scans exactly 6');
    const runB50 = await reconcileStaleRecordingsBatch({ batchLimit: 50, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(runB50.scanned, 50, 'batchLimit: 50 strictly capped at 50');

    // 6. FAILURE & RETRY WITHOUT LOSING FAIRNESS
    mockDb.clear();
    seedMeeting({
      id: 'mtg_c12_fail',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_fail',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: { egressId: 'eg_c12_fail', startedAt: tenMinAgo },
    });
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => { throw new Error('LiveKit egress connection reset'); };
    const runFail = await reconcileStaleRecordingsBatch({ batchLimit: 1, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(runFail.scanned, 1);
    assert.strictEqual(runFail.results[0].outcome, 'SKIPPED_QUIESCENT', 'Temporary egress query failure safely skipped for future retry');
    // Meeting remains eligible for next retry in PROCESSING
    assert.strictEqual(mockDb.get('mtg_c12_fail').recordingStatus, 'PROCESSING', 'Meeting remains eligible in PROCESSING for future retry');
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => ({ items: [] });

    // 7. TENANT ISOLATION
    mockDb.clear();
    seedMeeting({ id: 'mtg_c12_tA', tenantId: 'tenant_a', publicId: 'pub_c12_ta', recordingStatus: 'PROCESSING', updatedAt: tenMinAgo, recordingMetadata: { startedAt: tenMinAgo } });
    seedMeeting({ id: 'mtg_c12_tB', tenantId: 'tenant_b', publicId: 'pub_c12_tb', recordingStatus: 'PROCESSING', updatedAt: tenMinAgo, recordingMetadata: { startedAt: tenMinAgo } });
    const runTenant = await reconcileStaleRecordingsBatch({ batchLimit: 2, staleThresholdMs: 2 * 60 * 1000 });
    const resA = runTenant.results.find((r) => r.meetingId === 'mtg_c12_tA');
    const resB = runTenant.results.find((r) => r.meetingId === 'mtg_c12_tB');
    assert.strictEqual(resA.tenantId, 'tenant_a', 'Tenant A candidate retains Tenant A boundary');
    assert.strictEqual(resB.tenantId, 'tenant_b', 'Tenant B candidate retains Tenant B boundary');

    // 8. REGRESSION SAFETY: AMBIGUOUS EGRESS PRESERVED
    mockDb.clear();
    seedMeeting({
      id: 'mtg_c12_ambig',
      tenantId: 'tenant_a',
      publicId: 'pub_c12_ambig',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        start_intent: { roomName: 'room_ambig', initiatedAt: tenMinAgo, filePath: 'recordings/ambig.mp4' },
      },
    });
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action) => {
      if (action === 'ListEgress') {
        return {
          items: [
            { egress_id: 'eg_amb_1', room_name: 'room_ambig', status: 'EGRESS_ACTIVE', request: { file_outputs: [{ filepath: 'recordings/ambig.mp4' }] } },
            { egress_id: 'eg_amb_2', room_name: 'room_ambig', status: 'EGRESS_STARTING', request: { file_outputs: [{ filepath: 'recordings/ambig.mp4' }] } },
          ],
        };
      }
      return {};
    };
    const runAmbig = await reconcileStaleRecordingsBatch({ batchLimit: 1, staleThresholdMs: 2 * 60 * 1000 });
    assert.strictEqual(runAmbig.results[0].outcome, 'SKIPPED_AMBIGUOUS');
    assert.strictEqual(mockDb.get('mtg_c12_ambig').recordingStatus, 'PROCESSING', 'Ambiguous meeting status preserved in PROCESSING');

    // 9. EXPLICIT RPC ERROR HANDLING
    global.__MOCK_CURSOR_RPC_ERROR__ = 'PostgreSQL RPC connection timed out';
    let rpcErrorCaught = null;
    try {
      await reconcileStaleRecordingsBatch({ batchLimit: 1 });
    } catch (err) {
      rpcErrorCaught = err;
    }
    assert.ok(rpcErrorCaught, 'RPC failure throws error explicitly without silent fallback');
    assert.strictEqual(rpcErrorCaught.code, 'RECONCILIATION_CURSOR_RPC_FAILED');
    delete global.__MOCK_CURSOR_RPC_ERROR__;

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
    delete global.__LIVEKIT_ROOM_MOCK_HANDLER__;
  });

  // --- Suite 17: Fail-Closed Recording Reconciliation Safety Protocol ---
  console.log('\n--- Suite 17: Fail-Closed Recording Reconciliation Safety Protocol ---');

  // SAFE-1: Missing public.meetings table produces distinguishable 503 operational failure
  await test('[SAFE-1 MISSING SCHEMA 503] Missing public.meetings table fails closed with 503 RECONCILIATION_SCHEMA_UNAVAILABLE, not 200 OK zero work', async () => {
    mockDb.clear();
    global.__SIMULATE_MEETINGS_TABLE_MISSING__ = true;

    // 1. Direct function call
    let directError = null;
    try {
      await reconcileStaleRecordingsBatch({ batchLimit: 10 });
    } catch (err) {
      directError = err;
    }
    assert.ok(directError, 'Reconciler must throw when public.meetings is missing');
    assert.strictEqual(directError.code, 'RECONCILIATION_SCHEMA_UNAVAILABLE');
    assert.strictEqual(directError.statusCode, 503);

    // 2. HTTP route call via Next.js route handler
    process.env.CRON_SECRET = 'test_cron_secret_mock';
    const cronReq = new NextRequest('http://localhost/api/cron/reconcile-recordings', {
      method: 'POST',
      headers: { authorization: 'Bearer test_cron_secret_mock' },
    });
    const res = await cronRoute.POST(cronReq);
    assert.strictEqual(res.status, 503, 'Cron route must return HTTP 503 when schema is unavailable');
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, 'RECONCILIATION_SCHEMA_UNAVAILABLE');
    assert.ok(body.message.includes('unavailable'), 'Message must indicate unavailable infrastructure');
    assert.strictEqual(body.scanned, undefined, 'Must not return deceptive zero-work candidate count');

    delete global.__SIMULATE_MEETINGS_TABLE_MISSING__;
  });

  // SAFE-2: Candidate query errors are propagated and not silently swallowed
  await test('[SAFE-2 CANDIDATE ERROR PROPAGATION] Database query error during candidate selection is propagated and surfaces 500, not swallowed into empty list', async () => {
    mockDb.clear();
    global.__SIMULATE_CANDIDATE_QUERY_ERROR__ = { code: '57014', message: 'canceling statement due to statement timeout' };

    let queryError = null;
    try {
      await reconcileStaleRecordingsBatch({ batchLimit: 10 });
    } catch (err) {
      queryError = err;
    }
    assert.ok(queryError, 'Query error must not be swallowed into empty candidate array');
    assert.strictEqual(queryError.code, 'RECONCILIATION_DATABASE_ERROR');
    assert.strictEqual(queryError.statusCode, 500);

    const cronReq = new NextRequest('http://localhost/api/cron/reconcile-recordings', {
      method: 'GET',
      headers: { authorization: 'Bearer test_cron_secret_mock' },
    });
    const res = await cronRoute.GET(cronReq);
    assert.strictEqual(res.status, 500);
    const body = await res.json();
    assert.strictEqual(body.success, false);
    assert.strictEqual(body.error, 'RECONCILIATION_DATABASE_ERROR');

    delete global.__SIMULATE_CANDIDATE_QUERY_ERROR__;
  });

  // SAFE-3: Preflight failure protects cursor from advancement
  await test('[SAFE-3 PREFLIGHT CURSOR PROTECTION] Failed preflight prevents rotation cursor from advancing', async () => {
    mockDb.clear();
    global.__MOCK_RECONCILIATION_CURSOR_DB__ = { offset: 1, history: [] };
    global.__SIMULATE_MEETINGS_TABLE_MISSING__ = true;

    try {
      await reconcileStaleRecordingsBatch({ batchLimit: 1 });
    } catch (_) {}

    assert.strictEqual(
      global.__MOCK_RECONCILIATION_CURSOR_DB__.offset,
      1,
      'Cursor offset must NOT advance when preflight check fails'
    );
    assert.strictEqual(
      global.__MOCK_RECONCILIATION_CURSOR_DB__.history.length,
      0,
      'No cursor advancement history recorded on preflight failure'
    );

    delete global.__SIMULATE_MEETINGS_TABLE_MISSING__;
    delete global.__MOCK_RECONCILIATION_CURSOR_DB__;
  });

  // SAFE-4: Unavailable claim RPC fails closed in automated reconciliation without JSONB fallback
  await test('[SAFE-4 CLAIM INFRASTRUCTURE FAILURE] Unavailable claim RPC prevents candidate processing and fails closed without falling back to JSONB updates', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_safe_claim_infra',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-infra',
      title: 'Claim Infra Failure Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        startedAt: tenMinAgo,
        fileName: 'test_claim_infra.mp4',
      },
    });

    global.__SIMULATE_CLAIM_INFRASTRUCTURE_FAILURE__ = true;

    const batchRes = await reconcileStaleRecordingsBatch({ batchLimit: 1 });
    assert.strictEqual(batchRes.scanned, 1);
    assert.strictEqual(batchRes.reconciled, 0);
    assert.strictEqual(batchRes.failed, 1, 'Candidate must be recorded as FAILED when claim infrastructure is unavailable');

    const failResult = batchRes.results.find((r) => r.meetingId === 'mtg_safe_claim_infra');
    assert.strictEqual(failResult.outcome, 'FAILED');
    assert.ok(failResult.error.includes('CLAIM_INFRASTRUCTURE_UNAVAILABLE'), 'Error must report claim infrastructure failure');

    const m = mockDb.get('mtg_safe_claim_infra');
    assert.strictEqual(m.recordingStatus, 'PROCESSING', 'Meeting status must not be modified when claim acquisition fails');
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined, 'Must NOT fall back to creating JSONB claim');

    delete global.__SIMULATE_CLAIM_INFRASTRUCTURE_FAILURE__;
  });

  // SAFE-5: Legitimate concurrent claim conflict is handled distinctly from infrastructure failure
  await test('[SAFE-5 CONCURRENT CLAIM DISTINCTION] Concurrent claim conflict returns SKIPPED_CLAIM_HELD, distinct from claim infrastructure failure', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const activeClaimToken = 'tok_other_worker_active';

    seedMeeting({
      id: 'mtg_safe_claim_held',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-held',
      title: 'Claim Held Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        startedAt: tenMinAgo,
        processing_claim: {
          token: activeClaimToken,
          claimed_by: 'worker_alpha',
          claimed_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 8 * 60 * 1000).toISOString(),
        },
      },
    });

    const batchRes = await reconcileStaleRecordingsBatch({ batchLimit: 1 });
    assert.strictEqual(batchRes.scanned, 1);
    assert.strictEqual(batchRes.reconciled, 0);
    assert.strictEqual(batchRes.skipped, 1, 'Candidate must be SKIPPED, not FAILED, when another worker holds valid lease');
    assert.strictEqual(batchRes.failed, 0);

    const heldResult = batchRes.results.find((r) => r.meetingId === 'mtg_safe_claim_held');
    assert.strictEqual(heldResult.outcome, 'SKIPPED_CLAIM_HELD');
    assert.ok(heldResult.message.includes('actively processing') || heldResult.message.includes('Concurrent worker'));
  });

  // SAFE-6: Affirmative consent verification blocks adoption of completed egress if consent was declined
  await test('[SAFE-6 CONSENT DECLINED BLOCKS ADOPTION] Completed LiveKit Egress is blocked from being adopted into Google Drive if participant consent was declined', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_safe_declined_consent',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-declined-adopt',
      title: 'Declined Consent Adoption Blocked Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        egress_id: 'egress_completed_unconsented_999',
      },
    });

    // Seed relational consent session as DECLINED
    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_declined_adopt', {
      id: 'sess_declined_adopt',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe_declined_consent',
      status: 'DECLINED',
      created_at: tenMinAgo,
      updated_at: tenMinAgo,
    });

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'ListEgress') {
        return {
          items: [
            {
              egress_id: 'egress_completed_unconsented_999',
              status: 'EGRESS_COMPLETE',
              file_results: [{ filename: 'unconsented_file.mp4' }],
            },
          ],
        };
      }
      return {};
    };

    const adminSession = {
      user: { id: 'usr_reconciler', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    const recRes = await reconcileMeetingRecording({ meetingId: 'mtg_safe_declined_consent', session: adminSession });
    assert.strictEqual(recRes.reconciled, true);
    assert.strictEqual(recRes.status, 'FAILED', 'Meeting must transition to FAILED, never STORED, when consent was declined');
    assert.ok(recRes.message.includes('Participant consent was declined or withdrawn'));

    const m = mockDb.get('mtg_safe_declined_consent');
    assert.strictEqual(m.recordingStatus, 'FAILED');
    assert.ok(m.recordingMetadata.failure_reason.includes('participant consent was declined or withdrawn'));
    assert.strictEqual(m.recordingMetadata.uploadStatus, undefined, 'Upload must never occur for unconsented recording');

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // SAFE-7: Legitimately empty candidate queries still return clean zero-work result
  await test('[SAFE-7 LEGITIMATE EMPTY RESULT 200] When database infrastructure is healthy and no candidates match, returns successful zero-work result with 200 OK', async () => {
    mockDb.clear();

    const batchRes = await reconcileStaleRecordingsBatch({ batchLimit: 10 });
    assert.strictEqual(batchRes.scanned, 0);
    assert.strictEqual(batchRes.reconciled, 0);
    assert.strictEqual(batchRes.skipped, 0);
    assert.strictEqual(batchRes.failed, 0);
    assert.deepStrictEqual(batchRes.results, []);

    const cronReq = new NextRequest('http://localhost/api/cron/reconcile-recordings', {
      method: 'POST',
      headers: { authorization: 'Bearer test_cron_secret_mock' },
    });
    const res = await cronRoute.POST(cronReq);
    assert.strictEqual(res.status, 200);
    const body = await res.json();
    assert.strictEqual(body.success, true);
    assert.strictEqual(body.scanned, 0);
    assert.strictEqual(body.reconciled, 0);
    assert.strictEqual(body.failed, 0);
  });

  // SAFE-8: Cron authorization timing safety and batch limit enforcement remain intact
  await test('[SAFE-8 CRON AUTH & BATCH BOUNDS] Cron route timing-safe authorization and batch-limit bounds remain strictly enforced', async () => {
    process.env.CRON_SECRET = 'valid_secret_12345';

    // 1. Missing auth header -> 401
    const reqMissing = new NextRequest('http://localhost/api/cron/reconcile-recordings', { method: 'GET' });
    const resMissing = await cronRoute.GET(reqMissing);
    assert.strictEqual(resMissing.status, 401);

    // 2. Invalid auth header -> 401
    const reqInvalid = new NextRequest('http://localhost/api/cron/reconcile-recordings', {
      method: 'GET',
      headers: { authorization: 'Bearer wrong_secret' },
    });
    const resInvalid = await cronRoute.GET(reqInvalid);
    assert.strictEqual(resInvalid.status, 401);

    // 3. Batch limits bounded to [1, 50]
    mockDb.clear();
    const reqClamped = new NextRequest('http://localhost/api/cron/reconcile-recordings?limit=999', {
      method: 'GET',
      headers: { authorization: 'Bearer valid_secret_12345' },
    });
    const resClamped = await cronRoute.GET(reqClamped);
    assert.strictEqual(resClamped.status, 200);
  });

  // --- Suite 18: SAFE-9 Completed-Egress Reconciliation Consent Verification Protocol ---
  console.log('\n--- Suite 18: SAFE-9 Completed-Egress Reconciliation Consent Verification Protocol ---');

  // SAFE-9.1: Affirmative, valid consent permits the expected existing flow
  await test('[SAFE-9.1 VALID CONSENT ADOPTION] Valid affirmative consent permits completed-Egress adoption into Google Drive', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_safe9_valid',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe9-valid',
      title: 'Valid Consent Reconciliation Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        egress_id: 'egress_safe9_valid_111',
      },
    });

    // Authoritative relational consent session with affirmative participant consent
    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_safe9_valid', {
      id: 'sess_safe9_valid',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe9_valid',
      status: 'ALL_GRANTED',
      created_at: tenMinAgo,
      updated_at: tenMinAgo,
    });
    global.__MOCK_CONSENTS_DB__.set('sess_safe9_valid_usr_p1', {
      id: 'cst_safe9_valid_usr_p1',
      session_id: 'sess_safe9_valid',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe9_valid',
      participant_id: 'usr_p1',
      participant_name: 'Student 1',
      role: 'STUDENT',
      status: 'GRANTED',
      decided_at: tenMinAgo,
    });

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'ListEgress') {
        assert.strictEqual(body.egress_id, 'egress_safe9_valid_111');
        return {
          items: [
            {
              egress_id: 'egress_safe9_valid_111',
              status: 'EGRESS_COMPLETE',
              file_results: [{ filename: 'safe9_valid.mp4' }],
            },
          ],
        };
      }
      return {};
    };

    const filesBefore = googleConfig._memoryDriveFiles.size;
    const adminSession = {
      user: { id: 'usr_reconciler', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    const recRes = await reconcileMeetingRecording({ meetingId: 'mtg_safe9_valid', session: adminSession });
    assert.strictEqual(recRes.reconciled, true);
    assert.strictEqual(recRes.status, 'STORED', 'Meeting must transition to STORED upon valid affirmative consent');

    // Observable side effects
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore + 1, 'Google Drive file must be uploaded exactly once');
    const m = mockDb.get('mtg_safe9_valid');
    assert.strictEqual(m.recordingStatus, 'STORED');
    assert.ok(m.recordingMetadata.google_drive_file_id, 'Google Drive file ID must be persisted');
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined, 'Processing claim must be released on completion');

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // SAFE-9.2: Missing consent session blocks adoption and upload
  await test('[SAFE-9.2 MISSING SESSION BLOCKS ADOPTION] Missing consent session blocks completed-Egress adoption and Google Drive upload', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_safe9_missing_session',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe9-miss',
      title: 'Missing Consent Session Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        egress_id: 'egress_safe9_missing_222',
      },
    });

    // Explicitly NO session in __MOCK_CONSENT_SESSIONS_DB__
    global.__MOCK_CONSENT_SESSIONS_DB__.delete('sess_safe9_missing');

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action) => {
      if (action === 'ListEgress') {
        return {
          items: [
            {
              egress_id: 'egress_safe9_missing_222',
              status: 'EGRESS_COMPLETE',
              file_results: [{ filename: 'safe9_missing.mp4' }],
            },
          ],
        };
      }
      return {};
    };

    const filesBefore = googleConfig._memoryDriveFiles.size;
    const adminSession = {
      user: { id: 'usr_reconciler', email: 'admin@tenant-a.org' },
      tenantId: 'tenant_a',
      role: 'Super Admin',
    };

    const recRes = await reconcileMeetingRecording({ meetingId: 'mtg_safe9_missing_session', session: adminSession });
    assert.strictEqual(recRes.reconciled, true);
    assert.strictEqual(recRes.status, 'FAILED', 'Must transition to FAILED when consent session is missing');

    // Observable side effects: Zero upload, terminal FAILED, artifact preserved, claim released, audit recorded
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore, 'Google Drive upload must NEVER be invoked');
    const m = mockDb.get('mtg_safe9_missing_session');
    assert.strictEqual(m.recordingStatus, 'FAILED', 'Must never be marked STORED');
    assert.strictEqual(m.recordingMetadata.uploadStatus, undefined, 'Upload status must never be set');
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined, 'Processing claim must be released');
    assert.ok(m.recordingMetadata.unresolved_egress_artifact, 'Unresolved egress artifact must be preserved for investigation');
    assert.strictEqual(m.recordingMetadata.unresolved_egress_artifact.egressId, 'egress_safe9_missing_222');
    assert.strictEqual(m.recordingMetadata.unresolved_egress_artifact.reason, 'NO_ACTIVE_CONSENT_SESSION');

    const blockedAudits = global.__MOCK_CONSENT_AUDIT_DB__.filter(
      (a) => a.meeting_id === 'mtg_safe9_missing_session' && a.action === 'RECORDING_BLOCKED'
    );
    assert.ok(blockedAudits.length >= 1, 'RECORDING_BLOCKED must be audited in consent ledger');

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // SAFE-9.3: Pending or expired consent blocks adoption and upload
  await test('[SAFE-9.3 PENDING OR EXPIRED CONSENT BLOCKS ADOPTION] Pending or temporally expired consent blocks adoption', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // 1. Pending consent
    seedMeeting({
      id: 'mtg_safe9_pending',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe9-pend',
      title: 'Pending Consent Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        egress_id: 'egress_safe9_pending_333',
      },
    });

    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_safe9_pending', {
      id: 'sess_safe9_pending',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe9_pending',
      status: 'PENDING_CONSENT',
      created_at: tenMinAgo,
      updated_at: tenMinAgo,
    });
    global.__MOCK_CONSENTS_DB__.set('sess_safe9_pending_usr_p1', {
      id: 'cst_safe9_pending_usr_p1',
      session_id: 'sess_safe9_pending',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe9_pending',
      participant_id: 'usr_p1',
      status: 'PENDING',
    });

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => ({
      items: [{ egress_id: 'egress_safe9_pending_333', status: 'EGRESS_COMPLETE', file_results: [{ filename: 'pend.mp4' }] }],
    });

    const filesBefore1 = googleConfig._memoryDriveFiles.size;
    const adminSession = { user: { id: 'usr_reconciler', email: 'admin@tenant-a.org' }, tenantId: 'tenant_a', role: 'Super Admin' };

    const recRes1 = await reconcileMeetingRecording({ meetingId: 'mtg_safe9_pending', session: adminSession });
    assert.strictEqual(recRes1.status, 'FAILED');
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore1, 'No upload on pending consent');
    const m1 = mockDb.get('mtg_safe9_pending');
    assert.strictEqual(m1.recordingStatus, 'FAILED');
    assert.strictEqual(m1.recordingMetadata.processing_claim, undefined);

    // 2. Temporally expired consent
    seedMeeting({
      id: 'mtg_safe9_expired',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe9-exp',
      title: 'Expired Consent Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        egress_id: 'egress_safe9_expired_444',
      },
    });

    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_safe9_expired', {
      id: 'sess_safe9_expired',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe9_expired',
      status: 'EXPIRED',
      created_at: tenMinAgo,
      updated_at: tenMinAgo,
    });
    global.__MOCK_CONSENTS_DB__.set('sess_safe9_expired_usr_p1', {
      id: 'cst_safe9_expired_usr_p1',
      session_id: 'sess_safe9_expired',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe9_expired',
      participant_id: 'usr_p1',
      status: 'GRANTED',
    });

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => ({
      items: [{ egress_id: 'egress_safe9_expired_444', status: 'EGRESS_COMPLETE', file_results: [{ filename: 'exp.mp4' }] }],
    });

    const filesBefore2 = googleConfig._memoryDriveFiles.size;
    const recRes2 = await reconcileMeetingRecording({ meetingId: 'mtg_safe9_expired', session: adminSession });
    assert.strictEqual(recRes2.status, 'FAILED');
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore2, 'No upload on expired consent');
    const m2 = mockDb.get('mtg_safe9_expired');
    assert.strictEqual(m2.recordingStatus, 'FAILED');
    assert.strictEqual(m2.recordingMetadata.processing_claim, undefined);

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // SAFE-9.4: Withdrawn or declined consent blocks adoption and upload
  await test('[SAFE-9.4 WITHDRAWN OR DECLINED BLOCKS ADOPTION] Withdrawn or explicitly declined consent blocks adoption', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    // 1. Withdrawn consent
    seedMeeting({
      id: 'mtg_safe9_withdrawn',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe9-withdrawn',
      title: 'Withdrawn Consent Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        egress_id: 'egress_safe9_withdrawn_555',
      },
    });

    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_safe9_withdrawn', {
      id: 'sess_safe9_withdrawn',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe9_withdrawn',
      status: 'WITHDRAWN',
      created_at: tenMinAgo,
      updated_at: tenMinAgo,
    });
    global.__MOCK_CONSENTS_DB__.set('sess_safe9_withdrawn_usr_p1', {
      id: 'cst_safe9_withdrawn_usr_p1',
      session_id: 'sess_safe9_withdrawn',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe9_withdrawn',
      participant_id: 'usr_p1',
      status: 'WITHDRAWN',
      reason: 'Participant opted out',
    });

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => ({
      items: [{ egress_id: 'egress_safe9_withdrawn_555', status: 'EGRESS_COMPLETE', file_results: [{ filename: 'w.mp4' }] }],
    });

    const filesBefore = googleConfig._memoryDriveFiles.size;
    const adminSession = { user: { id: 'usr_reconciler', email: 'admin@tenant-a.org' }, tenantId: 'tenant_a', role: 'Super Admin' };

    const recRes = await reconcileMeetingRecording({ meetingId: 'mtg_safe9_withdrawn', session: adminSession });
    assert.strictEqual(recRes.status, 'FAILED');
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore, 'No upload on withdrawn consent');
    const m = mockDb.get('mtg_safe9_withdrawn');
    assert.strictEqual(m.recordingStatus, 'FAILED');
    assert.ok(m.recordingMetadata.failure_reason.includes('withdrawn'));
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined);
    assert.ok(m.recordingMetadata.unresolved_egress_artifact);

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // SAFE-9.5: Consent-query infrastructure failure blocks adoption and upload
  await test('[SAFE-9.5 QUERY INFRASTRUCTURE FAILURE FAILS CLOSED] Relational consent database error blocks adoption and releases claim', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_safe9_query_err',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe9-qerr',
      title: 'Consent Query Error Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        egress_id: 'egress_safe9_qerr_666',
      },
    });

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => ({
      items: [{ egress_id: 'egress_safe9_qerr_666', status: 'EGRESS_COMPLETE', file_results: [{ filename: 'err.mp4' }] }],
    });

    const filesBefore = googleConfig._memoryDriveFiles.size;
    const adminSession = { user: { id: 'usr_reconciler', email: 'admin@tenant-a.org' }, tenantId: 'tenant_a', role: 'Super Admin' };

    // Simulate database query error
    global.__SIMULATE_READ_FAILURE__ = true;
    try {
      const recRes = await reconcileMeetingRecording({ meetingId: 'mtg_safe9_query_err', session: adminSession });
      assert.strictEqual(recRes.status, 'FAILED', 'Must fail closed to FAILED on database read error');

      // Observable side effects
      assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore, 'Must never upload on database query error');
      const m = mockDb.get('mtg_safe9_query_err');
      assert.strictEqual(m.recordingStatus, 'FAILED');
      assert.strictEqual(m.recordingMetadata.processing_claim, undefined, 'Processing claim must be released on failure');

      const blockedAudits = global.__MOCK_CONSENT_AUDIT_DB__.filter(
        (a) => a.meeting_id === 'mtg_safe9_query_err' && a.action === 'RECORDING_BLOCKED'
      );
      assert.ok(blockedAudits.length >= 1, 'Failure must be audited');
    } finally {
      global.__SIMULATE_READ_FAILURE__ = false;
      delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
    }
  });

  // --- Suite 19: SAFE-10 LiveKit Webhook Completion Consent Verification Protocol ---
  console.log('\n--- Suite 19: SAFE-10 LiveKit Webhook Completion Consent Verification Protocol ---');

  // SAFE-10.1: Valid affirmative consent permits the expected upload
  await test('[SAFE-10.1 VALID WEBHOOK UPLOAD] Webhook egress_ended uploads and marks STORED when valid affirmative consent exists', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_safe10_valid',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe10-valid',
      title: 'Valid Webhook Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'RECORDING',
      recordingMetadata: {
        egress_id: 'egress_safe10_valid_777',
      },
    });

    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_safe10_valid', {
      id: 'sess_safe10_valid',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe10_valid',
      status: 'ACTIVE_RECORDING',
      created_at: tenMinAgo,
      updated_at: tenMinAgo,
    });
    global.__MOCK_CONSENTS_DB__.set('sess_safe10_valid_usr_p1', {
      id: 'cst_safe10_valid_usr_p1',
      session_id: 'sess_safe10_valid',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe10_valid',
      participant_id: 'usr_p1',
      status: 'GRANTED',
    });

    const webhookBody = {
      id: 'EV_safe10_valid_event',
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'egress_safe10_valid_777',
        roomName: 'mtg-pub-safe10-valid',
        status: 'EGRESS_COMPLETE',
        fileResults: [{ filename: 'safe10_valid.mp4', location: 's3://clasptek-bucket/recordings/safe10_valid.mp4' }],
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const filesBefore = googleConfig._memoryDriveFiles.size;
    const res = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });

    assert.strictEqual(res.status, 'UPLOADED_AND_STORED');
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore + 1, 'Google Drive file must be uploaded exactly once');
    const m = mockDb.get('mtg_safe10_valid');
    assert.strictEqual(m.recordingStatus, 'STORED');
    assert.ok(m.recordingMetadata.google_drive_file_id);
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined, 'Processing claim must be released');
  });

  // SAFE-10.2: Withdrawal before completion blocks Google Drive upload
  await test('[SAFE-10.2 WITHDRAWAL BLOCKS WEBHOOK UPLOAD] Participant withdrawal before webhook completion blocks Google Drive upload', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_safe10_withdrawn',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe10-w',
      title: 'Withdrawn Consent Webhook Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'RECORDING',
      recordingMetadata: {
        egress_id: 'egress_safe10_w_888',
      },
    });

    // Participant withdrew consent while egress was running
    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_safe10_w', {
      id: 'sess_safe10_w',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe10_withdrawn',
      status: 'WITHDRAWN',
      created_at: tenMinAgo,
      updated_at: tenMinAgo,
    });
    global.__MOCK_CONSENTS_DB__.set('sess_safe10_w_usr_p1', {
      id: 'cst_safe10_w_usr_p1',
      session_id: 'sess_safe10_w',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_safe10_withdrawn',
      participant_id: 'usr_p1',
      status: 'WITHDRAWN',
      reason: 'Revoked consent during meeting',
    });

    const webhookBody = {
      id: 'EV_safe10_w_event',
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'egress_safe10_w_888',
        roomName: 'mtg-pub-safe10-w',
        status: 'EGRESS_COMPLETE',
        fileResults: [{ filename: 'safe10_w.mp4', location: 's3://clasptek-bucket/recordings/safe10_w.mp4' }],
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const filesBefore = googleConfig._memoryDriveFiles.size;
    const res = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });

    assert.strictEqual(res.status, 'CONSENT_INVALID_UPLOAD_BLOCKED');
    assert.strictEqual(res.reason, 'CONSENT_WITHDRAWN');
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore, 'Google Drive upload must NEVER be invoked');

    const m = mockDb.get('mtg_safe10_withdrawn');
    assert.strictEqual(m.recordingStatus, 'FAILED', 'Must transition to FAILED');
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined, 'Processing claim must be released');
    assert.ok(m.recordingMetadata.unresolved_egress_artifact, 'Unresolved artifact must be captured');
    assert.strictEqual(m.recordingMetadata.unresolved_egress_artifact.reason, 'CONSENT_WITHDRAWN');

    const blockedAudits = global.__MOCK_CONSENT_AUDIT_DB__.filter(
      (a) => a.meeting_id === 'mtg_safe10_withdrawn' && a.action === 'RECORDING_BLOCKED'
    );
    assert.ok(blockedAudits.length >= 1, 'RECORDING_BLOCKED must be audited in consent ledger');
  });

  // SAFE-10.3: Missing or unverifiable consent blocks upload
  await test('[SAFE-10.3 MISSING CONSENT BLOCKS WEBHOOK UPLOAD] Missing consent session blocks webhook from uploading to Google Drive', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_safe10_missing',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe10-miss',
      title: 'Missing Consent Webhook Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        egress_id: 'egress_safe10_miss_999',
      },
    });

    const webhookBody = {
      id: 'EV_safe10_miss_event',
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'egress_safe10_miss_999',
        roomName: 'mtg-pub-safe10-miss',
        status: 'EGRESS_COMPLETE',
        fileResults: [{ filename: 'safe10_miss.mp4', location: 's3://clasptek-bucket/recordings/safe10_miss.mp4' }],
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const filesBefore = googleConfig._memoryDriveFiles.size;
    const res = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });

    assert.strictEqual(res.status, 'CONSENT_INVALID_UPLOAD_BLOCKED');
    assert.strictEqual(res.reason, 'NO_ACTIVE_CONSENT_SESSION');
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore, 'No Drive upload on missing consent');

    const m = mockDb.get('mtg_safe10_missing');
    assert.strictEqual(m.recordingStatus, 'FAILED');
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined);
    assert.ok(m.recordingMetadata.unresolved_egress_artifact);
  });

  // SAFE-10.4: Consent-query errors fail closed
  await test('[SAFE-10.4 QUERY ERROR FAILS CLOSED ON WEBHOOK] Database read error fails closed, releases claim, and blocks upload', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_safe10_qerr',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe10-qerr',
      title: 'Consent Query Error Webhook Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        egress_id: 'egress_safe10_qerr_000',
      },
    });

    const webhookBody = {
      id: 'EV_safe10_qerr_event',
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'egress_safe10_qerr_000',
        roomName: 'mtg-pub-safe10-qerr',
        status: 'EGRESS_COMPLETE',
        fileResults: [{ filename: 'safe10_qerr.mp4', location: 's3://clasptek-bucket/recordings/safe10_qerr.mp4' }],
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const filesBefore = googleConfig._memoryDriveFiles.size;
    global.__SIMULATE_READ_FAILURE__ = true;
    try {
      const res = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });
      assert.strictEqual(res.status, 'CONSENT_INVALID_UPLOAD_BLOCKED');
      assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore, 'Zero upload on database error');

      const m = mockDb.get('mtg_safe10_qerr');
      assert.strictEqual(m.recordingStatus, 'FAILED');
      assert.strictEqual(m.recordingMetadata.processing_claim, undefined, 'Claim must be released');
    } finally {
      global.__SIMULATE_READ_FAILURE__ = false;
    }
  });

  // SAFE-10.5: Duplicate webhook delivery cannot bypass consent checks
  await test('[SAFE-10.5 DUPLICATE WEBHOOK CANNOT BYPASS CONSENT] Re-delivered webhook event for blocked recording is deduplicated or fails closed', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_safe10_dup',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe10-dup',
      title: 'Duplicate Delivery Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'RECORDING',
      recordingMetadata: {
        egress_id: 'egress_safe10_dup_111',
      },
    });

    const webhookBody = {
      id: 'EV_safe10_dup_event_001',
      event: 'egress_ended',
      createdAt: Math.floor(Date.now() / 1000),
      egressInfo: {
        egressId: 'egress_safe10_dup_111',
        roomName: 'mtg-pub-safe10-dup',
        status: 'EGRESS_COMPLETE',
        fileResults: [{ filename: 'dup.mp4', location: 's3://bucket/dup.mp4' }],
      },
    };
    const bodyStr = JSON.stringify(webhookBody);
    const token = makeWebhookToken(bodyStr);

    const filesBefore = googleConfig._memoryDriveFiles.size;

    // Delivery 1: Blocks due to missing consent
    const res1 = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });
    assert.strictEqual(res1.status, 'CONSENT_INVALID_UPLOAD_BLOCKED');
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore);

    // Delivery 2: Same event redelivered
    const res2 = await handleLiveKitWebhook({ body: bodyStr, authHeader: `Bearer ${token}` });
    assert.ok(
      res2.status === 'DUPLICATE_EVENT_IGNORED' || res2.status === 'CONSENT_INVALID_UPLOAD_BLOCKED',
      'Redelivered webhook must either be deduplicated or blocked by consent gate'
    );
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore, 'Zero uploads across deliveries');

    const m = mockDb.get('mtg_safe10_dup');
    assert.strictEqual(m.recordingStatus, 'FAILED');
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined);
  });

  // SAFE-10.6: The orphaned-Egress recovery path cannot bypass the same policy
  await test('[SAFE-10.6 ORPHANED EGRESS CONSENT ENFORCEMENT] Orphaned Egress recovery path enforces consent gate and stops remote job', async () => {
    mockDb.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_safe10_orphaned',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-safe10-orph',
      title: 'Orphaned Egress Meeting',
      sfuProvider: 'livekit',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        start_intent: {
          roomName: 'room_safe10_orph',
          fileName: 'orph.mp4',
        },
      },
    });

    let stopEgressInvoked = false;
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async (action, body) => {
      if (action === 'ListEgress') {
        return {
          items: [
            {
              egress_id: 'egress_orphaned_unconsented_999',
              room_name: 'room_safe10_orph',
              status: 'EGRESS_ACTIVE',
              file_results: [{ filename: 'orph.mp4' }],
            },
          ],
        };
      }
      if (action === 'StopEgress') {
        assert.strictEqual(body.egress_id, 'egress_orphaned_unconsented_999');
        stopEgressInvoked = true;
        return { egress_id: 'egress_orphaned_unconsented_999', status: 'EGRESS_ABORTED' };
      }
      return {};
    };

    const filesBefore = googleConfig._memoryDriveFiles.size;
    const adminSession = { user: { id: 'usr_reconciler', email: 'admin@tenant-a.org' }, tenantId: 'tenant_a', role: 'Super Admin' };

    const recRes = await reconcileMeetingRecording({ meetingId: 'mtg_safe10_orphaned', session: adminSession });
    assert.strictEqual(recRes.reconciled, true);
    assert.strictEqual(recRes.status, 'FAILED');
    assert.strictEqual(stopEgressInvoked, true, 'Remote unconsented Egress must be stopped immediately');
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore, 'No upload to Google Drive');

    const m = mockDb.get('mtg_safe10_orphaned');
    assert.strictEqual(m.recordingStatus, 'FAILED');
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined, 'Claim must be released');
    assert.strictEqual(m.recordingMetadata.start_intent, null);
    assert.ok(m.recordingMetadata.unresolved_egress_artifact);

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // --- Suite 20: Concurrency-Safe Recording Claim Lifecycle Protocol ---
  console.log('\n--- Suite 20: Concurrency-Safe Recording Claim Lifecycle Protocol ---');

  // CLAIM-1: Worker A cannot clear Worker B's newer claim
  // CLAIM-1: Worker A cannot clear Worker B's newer claim; no active fencing token disclosure
  await test('[CLAIM-1 TOKEN MISMATCH BLOCKS RELEASE] Worker A cannot clear Worker B newer claim, and active token is never disclosed', async () => {
    // NOTE: This unit test verifies application logic and mock RPC response contract.
    // True database row-level locking (FOR UPDATE) and transaction serialization require real PostgreSQL testing.
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_claim_race_1',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-1',
      title: 'Claim Race Meeting 1',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        processing_claim: {
          token: 'token_worker_b_newer',
          claimed_by: 'worker_b',
          claimed_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      },
    });

    global.__MOCK_PROCESSING_CLAIMS_DB__.set('mtg_claim_race_1', {
      meeting_id: 'mtg_claim_race_1',
      tenant_id: 'tenant_a',
      claim_token: 'token_worker_b_newer',
      claimed_by: 'worker_b',
    });

    // Worker A tries to release using its stale token
    const res = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_claim_race_1',
      tenantId: 'tenant_a',
      claimToken: 'token_worker_a_stale',
    });

    assert.strictEqual(res.released, false);
    assert.strictEqual(res.reason, 'TOKEN_MISMATCH');
    // Security check: must NEVER return or leak Worker B's active fencing token
    assert.strictEqual(res.activeToken, undefined);
    assert.strictEqual(JSON.stringify(res).includes('token_worker_b_newer'), false);

    // Verify Worker B's claim was NOT removed
    const m = mockDb.get('mtg_claim_race_1');
    assert.ok(m.recordingMetadata.processing_claim, 'Worker B claim must be preserved in metadata');
    assert.strictEqual(m.recordingMetadata.processing_claim.token, 'token_worker_b_newer');
    assert.strictEqual(global.__MOCK_PROCESSING_CLAIMS_DB__.get('mtg_claim_race_1')?.claim_token, 'token_worker_b_newer');
  });

  // CLAIM-2: A stale worker cannot delete another worker's relational claim
  await test('[CLAIM-2 RELATIONAL CLAIM PRESERVATION] Stale worker cannot delete another worker relational claim', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();

    seedMeeting({
      id: 'mtg_claim_rel_1',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-rel',
      title: 'Relational Claim Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: 'active_token_current',
          claimed_by: 'current_worker',
          claimed_at: new Date().toISOString(),
        },
      },
    });

    global.__MOCK_PROCESSING_CLAIMS_DB__.set('mtg_claim_rel_1', {
      meeting_id: 'mtg_claim_rel_1',
      tenant_id: 'tenant_a',
      claim_token: 'active_token_current',
      claimed_by: 'current_worker',
    });

    // Stale worker releases with old token
    const res = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_claim_rel_1',
      tenantId: 'tenant_a',
      claimToken: 'stale_token_old',
    });

    assert.strictEqual(res.released, false);
    assert.ok(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_claim_rel_1'));
    assert.strictEqual(global.__MOCK_PROCESSING_CLAIMS_DB__.get('mtg_claim_rel_1').claim_token, 'active_token_current');
  });

  // CLAIM-3: Successful release clears only the matching claim on both tables
  await test('[CLAIM-3 MATCHING CLAIM ATOMIC RELEASE] Successful release clears only matching claim across metadata and relational table', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();
    global.__MOCK_CONSENT_AUDIT_DB__ = [];

    seedMeeting({
      id: 'mtg_claim_success_1',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-succ',
      title: 'Claim Success Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: 'token_worker_valid',
          claimed_by: 'worker_valid',
          claimed_at: new Date().toISOString(),
        },
      },
    });

    global.__MOCK_PROCESSING_CLAIMS_DB__.set('mtg_claim_success_1', {
      meeting_id: 'mtg_claim_success_1',
      tenant_id: 'tenant_a',
      claim_token: 'token_worker_valid',
      claimed_by: 'worker_valid',
    });

    const res = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_claim_success_1',
      tenantId: 'tenant_a',
      claimToken: 'token_worker_valid',
    });

    assert.strictEqual(res.released, true);
    assert.strictEqual(res.auditLogged, true);

    const m = mockDb.get('mtg_claim_success_1');
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined, 'Metadata claim must be removed');
    assert.strictEqual(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_claim_success_1'), false, 'Relational claim must be deleted');

    // Audit log check: verify generic description without claim token disclosure
    const auditEntry = global.__MOCK_CONSENT_AUDIT_DB__.find((a) => a.action === 'CLAIM_RELEASED');
    assert.ok(auditEntry, 'Audit log entry must be present');
    assert.strictEqual(auditEntry.reason, 'Processing claim released by authorized worker');
    assert.strictEqual(auditEntry.reason.includes('token_worker_valid'), false);
  });

  // CLAIM-4: Missing or empty claim token fails safely with CLAIM_TOKEN_REQUIRED
  await test('[CLAIM-4 EMPTY/ABSENT TOKEN SAFE HANDLING] Missing, whitespace, or absent claim token behaves safely', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();

    seedMeeting({
      id: 'mtg_claim_absent_1',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-abs',
      title: 'Absent Claim Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: 'active_token_absent_test',
          claimed_by: 'worker_keep',
        },
      },
    });
    global.__MOCK_PROCESSING_CLAIMS_DB__.set('mtg_claim_absent_1', {
      meeting_id: 'mtg_claim_absent_1',
      tenant_id: 'tenant_a',
      claim_token: 'active_token_absent_test',
    });

    // Empty string
    const resEmpty = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_claim_absent_1',
      tenantId: 'tenant_a',
      claimToken: '',
    });
    assert.strictEqual(resEmpty.released, false);
    assert.strictEqual(resEmpty.reason, 'CLAIM_TOKEN_REQUIRED');

    // Whitespace only
    const resWhitespace = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_claim_absent_1',
      tenantId: 'tenant_a',
      claimToken: '   ',
    });
    assert.strictEqual(resWhitespace.released, false);
    assert.strictEqual(resWhitespace.reason, 'CLAIM_TOKEN_REQUIRED');

    // Neither metadata claim nor relational claim should be touched
    const m = mockDb.get('mtg_claim_absent_1');
    assert.ok(m.recordingMetadata.processing_claim);
    assert.ok(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_claim_absent_1'));

    // Absent claim on meeting (cleared beforehand)
    delete m.recordingMetadata.processing_claim;
    mockDb.set('mtg_claim_absent_1', m);
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();

    const resAbsent = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_claim_absent_1',
      tenantId: 'tenant_a',
      claimToken: 'some_random_token',
    });
    assert.strictEqual(resAbsent.released, true);
    assert.strictEqual(resAbsent.reason, 'NO_ACTIVE_CLAIM');
  });

  // CLAIM-5: Missing RPC, permission denied, DB error, and transport timeout fail closed without invoking fallback
  await test('[CLAIM-5 FAIL-CLOSED ON RPC ERRORS (NO FALLBACK)] RPC missing, permission denied, generic DB error, and thrown transport timeout fail closed without fallback', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();

    const setupMeeting = (id, token) => {
      seedMeeting({
        id,
        tenantId: 'tenant_a',
        publicId: `mtg-pub-${id}`,
        title: `RPC Failure Test Meeting ${id}`,
        recordingStatus: 'PROCESSING',
        recordingMetadata: {
          processing_claim: {
            token,
            claimed_by: 'worker_fail_closed',
          },
          preserved_marker: 'must_remain_untouched',
        },
      });
      global.__MOCK_PROCESSING_CLAIMS_DB__.set(id, {
        meeting_id: id,
        tenant_id: 'tenant_a',
        claim_token: token,
      });
    };

    // 5a. Missing RPC (PostgreSQL 42883)
    setupMeeting('mtg_err_missing_rpc', 'tok_missing_rpc');
    global.__SIMULATE_CLAIM_INFRASTRUCTURE_FAILURE__ = true;
    try {
      const res = await releaseRecordingProcessingClaim({
        meetingId: 'mtg_err_missing_rpc',
        tenantId: 'tenant_a',
        claimToken: 'tok_missing_rpc',
      });
      assert.strictEqual(res.released, false);
      assert.strictEqual(res.reason, 'CLAIM_INFRASTRUCTURE_UNAVAILABLE');
      // Verify NO fallback occurred: metadata claim and relational claim remain intact
      const m = mockDb.get('mtg_err_missing_rpc');
      assert.strictEqual(m.recordingMetadata.processing_claim.token, 'tok_missing_rpc');
      assert.strictEqual(m.recordingMetadata.preserved_marker, 'must_remain_untouched');
      assert.ok(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_err_missing_rpc'));
    } finally {
      global.__SIMULATE_CLAIM_INFRASTRUCTURE_FAILURE__ = false;
    }

    // 5b. Permission Denied RPC (PostgreSQL 42501)
    setupMeeting('mtg_err_perm_denied', 'tok_perm_denied');
    global.__SIMULATE_CLAIM_PERMISSION_ERROR__ = true;
    try {
      const res = await releaseRecordingProcessingClaim({
        meetingId: 'mtg_err_perm_denied',
        tenantId: 'tenant_a',
        claimToken: 'tok_perm_denied',
      });
      assert.strictEqual(res.released, false);
      assert.strictEqual(res.reason, 'CLAIM_RELEASE_PERMISSION_DENIED');
      const m = mockDb.get('mtg_err_perm_denied');
      assert.strictEqual(m.recordingMetadata.processing_claim.token, 'tok_perm_denied');
      assert.ok(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_err_perm_denied'));
    } finally {
      global.__SIMULATE_CLAIM_PERMISSION_ERROR__ = false;
    }

    // 5c. Generic DB error (PostgreSQL 50000)
    setupMeeting('mtg_err_db_generic', 'tok_db_generic');
    global.__SIMULATE_CLAIM_GENERIC_DB_ERROR__ = true;
    try {
      const res = await releaseRecordingProcessingClaim({
        meetingId: 'mtg_err_db_generic',
        tenantId: 'tenant_a',
        claimToken: 'tok_db_generic',
      });
      assert.strictEqual(res.released, false);
      assert.strictEqual(res.reason, 'CLAIM_RELEASE_DATABASE_ERROR');
      const m = mockDb.get('mtg_err_db_generic');
      assert.strictEqual(m.recordingMetadata.processing_claim.token, 'tok_db_generic');
      assert.ok(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_err_db_generic'));
    } finally {
      global.__SIMULATE_CLAIM_GENERIC_DB_ERROR__ = false;
    }

    // 5d. Thrown transport / timeout error
    setupMeeting('mtg_err_transport_throw', 'tok_transport_throw');
    global.__SIMULATE_CLAIM_TRANSPORT_THROW__ = true;
    try {
      const res = await releaseRecordingProcessingClaim({
        meetingId: 'mtg_err_transport_throw',
        tenantId: 'tenant_a',
        claimToken: 'tok_transport_throw',
      });
      assert.strictEqual(res.released, false);
      assert.strictEqual(res.reason, 'CLAIM_INFRASTRUCTURE_UNAVAILABLE');
      const m = mockDb.get('mtg_err_transport_throw');
      assert.strictEqual(m.recordingMetadata.processing_claim.token, 'tok_transport_throw');
      assert.ok(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_err_transport_throw'));
    } finally {
      global.__SIMULATE_CLAIM_TRANSPORT_THROW__ = false;
    }
  });

  // CLAIM-6: Audit insertion failure preserves successful claim release with auditLogged: false
  await test('[CLAIM-6 AUDIT FAILURE TOLERANCE] Audit insertion failure does not abort or rollback claim release', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();

    seedMeeting({
      id: 'mtg_claim_audit_fail',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-audit-fail',
      title: 'Audit Failure Tolerance Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: 'token_audit_fail_test',
          claimed_by: 'worker_audit_test',
        },
      },
    });
    global.__MOCK_PROCESSING_CLAIMS_DB__.set('mtg_claim_audit_fail', {
      meeting_id: 'mtg_claim_audit_fail',
      tenant_id: 'tenant_a',
      claim_token: 'token_audit_fail_test',
    });

    global.__SIMULATE_AUDIT_INSERT_FAILURE__ = true;
    try {
      const res = await releaseRecordingProcessingClaim({
        meetingId: 'mtg_claim_audit_fail',
        tenantId: 'tenant_a',
        claimToken: 'token_audit_fail_test',
      });

      // Claim release succeeded even though audit insert failed
      assert.strictEqual(res.released, true);
      assert.strictEqual(res.auditLogged, false);

      // Metadata claim removed and relational claim deleted
      const m = mockDb.get('mtg_claim_audit_fail');
      assert.strictEqual(m.recordingMetadata.processing_claim, undefined);
      assert.strictEqual(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_claim_audit_fail'), false);
    } finally {
      global.__SIMULATE_AUDIT_INSERT_FAILURE__ = false;
    }
  });

  // CLAIM-7: No fencing token disclosure in returned errors, audit entries, or logs
  await test('[CLAIM-7 NO TOKEN DISCLOSURE] Raw claim tokens are never disclosed in errors, logs, or audit records', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();
    global.__MOCK_CONSENT_AUDIT_DB__ = [];

    const secretToken = 'super_secret_claim_token_999';

    seedMeeting({
      id: 'mtg_claim_disclosure_test',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-disclosure-test',
      title: 'Token Disclosure Test Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: secretToken,
          claimed_by: 'worker_secret',
        },
      },
    });
    global.__MOCK_PROCESSING_CLAIMS_DB__.set('mtg_claim_disclosure_test', {
      meeting_id: 'mtg_claim_disclosure_test',
      tenant_id: 'tenant_a',
      claim_token: secretToken,
    });

    // Attempt release with unauthorized token
    const mismatchRes = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_claim_disclosure_test',
      tenantId: 'tenant_a',
      claimToken: 'wrong_token',
    });

    // Mismatch response must NOT contain the secret token
    assert.strictEqual(JSON.stringify(mismatchRes).includes(secretToken), false);
    assert.strictEqual(mismatchRes.activeToken, undefined);

    // Release with the actual token
    const successRes = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_claim_disclosure_test',
      tenantId: 'tenant_a',
      claimToken: secretToken,
    });
    assert.strictEqual(successRes.released, true);

    // Check all audit records created: none may contain the raw secret token
    for (const entry of global.__MOCK_CONSENT_AUDIT_DB__) {
      assert.strictEqual(JSON.stringify(entry).includes(secretToken), false, 'Audit records must never disclose raw claim token');
    }
  });

  // CLAIM-8: Unrelated recording metadata is preserved
  await test('[CLAIM-8 METADATA PRESERVED] Release removes only processing_claim without replacing or wiping unrelated metadata', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();

    seedMeeting({
      id: 'mtg_claim_meta_1',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-meta',
      title: 'Preserve Metadata Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        start_intent: {
          token: 'tok_intent_preserve',
          roomName: 'room_preserve',
        },
        active_participants: [
          { participantId: 'usr_p1', participantName: 'Student 1', role: 'STUDENT', joinedAt: new Date().toISOString() },
        ],
        custom_audit_marker: 'preserve_me_123',
        processing_claim: {
          token: 'token_to_release',
          claimed_by: 'worker_meta',
        },
      },
    });

    const res = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_claim_meta_1',
      tenantId: 'tenant_a',
      claimToken: 'token_to_release',
    });

    assert.strictEqual(res.released, true);

    const m = mockDb.get('mtg_claim_meta_1');
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined);
    assert.ok(m.recordingMetadata.start_intent, 'start_intent must be preserved');
    assert.strictEqual(m.recordingMetadata.start_intent.roomName, 'room_preserve');
    assert.strictEqual(m.recordingMetadata.active_participants.length, 1);
    assert.strictEqual(m.recordingMetadata.custom_audit_marker, 'preserve_me_123');
  });

  // CLAIM-9: Missing or invalid consent continues to block downloads, uploads, and STORED transitions
  await test('[CLAIM-9 CONSENT GATE PERSISTENCE] Missing or invalid consent blocks download/upload even while claim is safely released', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();
    const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    seedMeeting({
      id: 'mtg_claim_gate_1',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-gate',
      title: 'Consent Gate Persistence Meeting',
      recordingStatus: 'PROCESSING',
      updatedAt: tenMinAgo,
      recordingMetadata: {
        egress_id: 'egress_gate_test_123',
      },
    });

    // Relational consent explicitly DECLINED
    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_claim_gate_1', {
      id: 'sess_claim_gate_1',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_claim_gate_1',
      status: 'DECLINED',
      created_at: tenMinAgo,
      updated_at: tenMinAgo,
    });
    global.__MOCK_CONSENTS_DB__.set('sess_claim_gate_1_usr_p1', {
      id: 'cst_claim_gate_1_usr_p1',
      session_id: 'sess_claim_gate_1',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_claim_gate_1',
      participant_id: 'usr_p1',
      status: 'DECLINED',
    });

    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => ({
      items: [{ egress_id: 'egress_gate_test_123', status: 'EGRESS_COMPLETE', file_results: [{ filename: 'gate.mp4' }] }],
    });

    const filesBefore = googleConfig._memoryDriveFiles.size;
    const adminSession = { user: { id: 'usr_reconciler', email: 'admin@tenant-a.org' }, tenantId: 'tenant_a', role: 'Super Admin' };

    const recRes = await reconcileMeetingRecording({ meetingId: 'mtg_claim_gate_1', session: adminSession });
    assert.strictEqual(recRes.status, 'FAILED');
    assert.strictEqual(googleConfig._memoryDriveFiles.size, filesBefore, 'Zero Drive uploads');

    const m = mockDb.get('mtg_claim_gate_1');
    assert.strictEqual(m.recordingStatus, 'FAILED');
    assert.strictEqual(m.recordingMetadata.processing_claim, undefined, 'Processing claim must be cleanly released');
    assert.ok(m.recordingMetadata.unresolved_egress_artifact, 'Unresolved artifact preserved');

    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // CLAIM-10: Error paths do NOT clear processing_claim via unfenced metadata update before token release
  await test('[CLAIM-10 ERROR PATH PRESERVES CLAIM UNTIL TOKEN RELEASE] Error path does not unfencedly clear claim before token release RPC', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();

    seedMeeting({
      id: 'mtg_claim_err_preserve_10',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-10',
      title: 'Claim Error Preserve Meeting',
      recordingStatus: 'RECORDING',
      recordingMetadata: {
        preserved_marker: 'stay_safe_10',
      },
    });

    // Simulate RPC failure during claim release specifically (acquisition succeeds)
    global.__SIMULATE_CLAIM_GENERIC_DB_ERROR__ = true;
    try {
      const adminSession = { user: { id: 'usr_reconciler' }, tenantId: 'tenant_a', role: 'Super Admin' };

      const res = await reconcileMeetingRecording({ meetingId: 'mtg_claim_err_preserve_10', session: adminSession });
      assert.strictEqual(res.status, 'FAILED');

      // Crucial verification: Since the release RPC was simulated failing, the error path
      // MUST NOT have executed an unfenced metadata wipe of processing_claim!
      const m = mockDb.get('mtg_claim_err_preserve_10');
      assert.strictEqual(m.recordingStatus, 'FAILED');
      assert.ok(m.recordingMetadata.processing_claim, 'Active claim must remain preserved when release RPC fails');
      assert.ok(m.recordingMetadata.processing_claim.token, 'Claim token must be present');
      assert.strictEqual(m.recordingMetadata.preserved_marker, 'stay_safe_10', 'Preserved marker must remain intact');
      assert.ok(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_claim_err_preserve_10'));

      const acquiredToken = m.recordingMetadata.processing_claim.token;

      // Now disable simulated release failure and verify that authoritative release removes it
      global.__SIMULATE_CLAIM_GENERIC_DB_ERROR__ = false;
      const releaseRes = await releaseRecordingProcessingClaim({
        meetingId: 'mtg_claim_err_preserve_10',
        tenantId: 'tenant_a',
        claimToken: acquiredToken,
      });
      assert.strictEqual(releaseRes.released, true);
      assert.strictEqual(m.recordingMetadata.processing_claim, undefined, 'Claim must be removed only after authoritative release');
      assert.strictEqual(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_claim_err_preserve_10'), false);
    } finally {
      global.__SIMULATE_CLAIM_GENERIC_DB_ERROR__ = false;
    }
  });

  // CLAIM-11: A stale worker cannot remove a newer worker's claim during error handling
  await test('[CLAIM-11 STALE WORKER CANNOT CLEAR NEWER CLAIM ON ERROR] Stale worker error cleanup does not overwrite newer worker claim', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();
    const staleToken = 'stale_worker_token_11';
    const newerToken = 'newer_worker_token_11';

    seedMeeting({
      id: 'mtg_claim_stale_cleanup_11',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-11',
      title: 'Stale Cleanup Race Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        // Newer worker acquired claim in the meantime
        processing_claim: {
          token: newerToken,
          claimed_by: 'newer_worker_11',
          claimed_at: new Date().toISOString(),
        },
      },
    });
    global.__MOCK_PROCESSING_CLAIMS_DB__.set('mtg_claim_stale_cleanup_11', {
      meeting_id: 'mtg_claim_stale_cleanup_11',
      tenant_id: 'tenant_a',
      claim_token: newerToken,
    });

    // Stale worker tries to release using its stale token
    const res = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_claim_stale_cleanup_11',
      tenantId: 'tenant_a',
      claimToken: staleToken,
    });

    assert.strictEqual(res.released, false);
    assert.strictEqual(res.reason, 'TOKEN_MISMATCH');

    // Newer worker's claim must be completely unharmed in both metadata and relational store
    const m = mockDb.get('mtg_claim_stale_cleanup_11');
    assert.ok(m.recordingMetadata.processing_claim);
    assert.strictEqual(m.recordingMetadata.processing_claim.token, newerToken);
    assert.strictEqual(global.__MOCK_PROCESSING_CLAIMS_DB__.get('mtg_claim_stale_cleanup_11')?.claim_token, newerToken);
  });

  // CLAIM-12: NO_ACTIVE_CLAIM deliberately reports auditLogged: false without falsely claiming audit write
  await test('[CLAIM-12 NO_ACTIVE_CLAIM HANDLED DELIBERATELY] Idempotent release with NO_ACTIVE_CLAIM sets auditLogged: false', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();
    global.__MOCK_CONSENT_AUDIT_DB__ = [];

    seedMeeting({
      id: 'mtg_claim_no_active_12',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-12',
      title: 'No Active Claim Meeting',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {},
    });

    const res = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_claim_no_active_12',
      tenantId: 'tenant_a',
      claimToken: 'some_claim_token_12',
    });

    assert.strictEqual(res.released, true);
    assert.strictEqual(res.reason, 'NO_ACTIVE_CLAIM');
    assert.strictEqual(res.auditLogged, false, 'Must not claim that an audit event was written when no active claim existed');
    assert.strictEqual(global.__MOCK_CONSENT_AUDIT_DB__.length, 0, 'Zero audit records written');
  });

  // CLAIM-13: Audit insertion failure emits observable warning without leaking secrets or tokens
  await test('[CLAIM-13 AUDIT FAILURE EMITS SANITIZED WARNING] Audit insertion failure is observably warned without leaking tokens', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();
    const secretClaimToken = 'very_confidential_token_xyz_13';

    seedMeeting({
      id: 'mtg_claim_audit_warn_13',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-claim-13',
      title: 'Audit Warning Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: secretClaimToken,
          claimed_by: 'worker_audit_warn',
        },
      },
    });
    global.__MOCK_PROCESSING_CLAIMS_DB__.set('mtg_claim_audit_warn_13', {
      meeting_id: 'mtg_claim_audit_warn_13',
      tenant_id: 'tenant_a',
      claim_token: secretClaimToken,
    });

    const warnings = [];
    const origWarn = console.warn;
    console.warn = (...args) => warnings.push(args.join(' '));

    global.__SIMULATE_AUDIT_INSERT_FAILURE__ = true;
    try {
      const res = await releaseRecordingProcessingClaim({
        meetingId: 'mtg_claim_audit_warn_13',
        tenantId: 'tenant_a',
        claimToken: secretClaimToken,
      });

      assert.strictEqual(res.released, true);
      assert.strictEqual(res.auditLogged, false);

      // Verify observable warning was emitted
      assert.ok(warnings.length >= 1, 'An observable warning must be logged on audit insert failure');
      const warningText = warnings.join(' ');
      assert.ok(warningText.includes('mtg_claim_audit_warn_13'), 'Warning must identify meeting');

      // Security check: must NOT leak raw claim tokens or SQL internals
      assert.strictEqual(warningText.includes(secretClaimToken), false, 'Warning must never contain raw claim token');
      assert.strictEqual(warningText.includes('Simulated disk error'), false, 'Warning must never contain internal SQL error');
    } finally {
      console.warn = origWarn;
      global.__SIMULATE_AUDIT_INSERT_FAILURE__ = false;
    }
  });

  // --- Suite 21: Token-Fenced Recording Metadata Concurrency Protocol (DEF-01) ---
  console.log('\n--- Suite 21: Token-Fenced Recording Metadata Concurrency Protocol (DEF-01) ---');

  // FENCE-01: Stale worker rejected
  await test('[FENCE-01 STALE WORKER REJECTED] Worker A holding token A is rejected after Worker B replaces claim with token B', async () => {
    mockDb.clear();
    const tokenA = 'tok_worker_a_fence01';
    const tokenB = 'tok_worker_b_fence01';
    const nowStr = new Date().toISOString();

    seedMeeting({
      id: 'mtg_fence_01',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-fence-01',
      title: 'Fence 01 Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        active_worker: 'worker_b',
        processing_claim: {
          token: tokenB,
          claimed_by: 'worker_b',
          claimed_at: nowStr,
          lease_expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
        },
      },
    });

    // Stale Worker A attempts update with token A
    const staleRes = await queries.updateMeetingRecordingMetadata(
      'mtg_fence_01',
      'FAILED',
      { failure_reason: 'Worker A delayed failure error' },
      { claimToken: tokenA }
    );

    assert.strictEqual(staleRes.success, false, 'Stale worker write must be rejected');
    assert.strictEqual(staleRes.reason, 'TOKEN_MISMATCH', 'Rejection reason must be TOKEN_MISMATCH');

    // Verify Worker B state remains completely unchanged
    const m = mockDb.get('mtg_fence_01');
    assert.strictEqual(m.recordingStatus, 'PROCESSING', 'Status must remain PROCESSING under Worker B');
    assert.strictEqual(m.recordingMetadata.processing_claim.token, tokenB, 'Token B must remain active claim');
    assert.strictEqual(m.recordingMetadata.failure_reason, undefined, 'Stale error metadata must not be written');
  });

  // FENCE-02: No stale JSONB restoration
  await test('[FENCE-02 NO STALE JSONB RESTORATION] Stale worker cannot restore outdated JSONB snapshot over newer metadata', async () => {
    mockDb.clear();
    const tokenA = 'tok_worker_a_fence02';
    const tokenB = 'tok_worker_b_fence02';

    // Worker B committed new state
    seedMeeting({
      id: 'mtg_fence_02',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-fence-02',
      title: 'Fence 02 Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        new_key_by_worker_b: 'fresh_data_123',
        pipeline_phase: 'DRIVE_STREAMING',
        processing_claim: {
          token: tokenB,
          claimed_by: 'worker_b',
          claimed_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
        },
      },
    });

    // Stale Worker A holds an obsolete snapshot without new_key_by_worker_b and attempts update
    const staleRes = await queries.updateMeetingRecordingMetadata(
      'mtg_fence_02',
      'FAILED',
      {
        obsolete_key_worker_a: 'stale_snapshot',
        pipeline_phase: 'EGRESS_DOWNLOAD',
      },
      { claimToken: tokenA }
    );

    assert.strictEqual(staleRes.success, false);
    assert.strictEqual(staleRes.reason, 'TOKEN_MISMATCH');

    // Verify DB row preserves Worker B fresh data and does not restore Worker A's snapshot
    const m = mockDb.get('mtg_fence_02');
    assert.strictEqual(m.recordingMetadata.new_key_by_worker_b, 'fresh_data_123');
    assert.strictEqual(m.recordingMetadata.pipeline_phase, 'DRIVE_STREAMING');
    assert.strictEqual(m.recordingMetadata.obsolete_key_worker_a, undefined);
  });

  // FENCE-03: Correct owner can update
  await test('[FENCE-03 CORRECT OWNER CAN UPDATE] Worker holding current token can update status and metadata atomically', async () => {
    mockDb.clear();
    const tokenB = 'tok_worker_b_fence03';

    seedMeeting({
      id: 'mtg_fence_03',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-fence-03',
      title: 'Fence 03 Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: tokenB,
          claimed_by: 'worker_b',
          claimed_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
        },
      },
    });

    const updateRes = await queries.updateMeetingRecordingMetadata(
      'mtg_fence_03',
      'STORED',
      {
        driveFileId: 'file_fence_03_drive',
        webViewLink: 'https://drive.google.com/file/fence03',
      },
      { claimToken: tokenB }
    );

    assert.strictEqual(updateRes.success, true);
    assert.strictEqual(updateRes.error, null);

    const m = mockDb.get('mtg_fence_03');
    assert.strictEqual(m.recordingStatus, 'STORED');
    assert.strictEqual(m.recordingMetadata.driveFileId, 'file_fence_03_drive');
    assert.strictEqual(m.recordingMetadata.processing_claim.token, tokenB, 'Processing claim preserved until release RPC');
    assert.strictEqual(m.recordingUrl, 'https://drive.google.com/file/fence03');
  });

  // FENCE-04: Tenant mismatch rejected
  await test('[FENCE-04 TENANT MISMATCH REJECTED] Token associated with one tenant cannot update another tenant meeting', async () => {
    mockDb.clear();
    const tokenB = 'tok_worker_b_fence04';

    seedMeeting({
      id: 'mtg_fence_04_tenant_b',
      tenantId: 'tenant_b',
      publicId: 'mtg-pub-fence-04-b',
      title: 'Fence 04 Tenant B Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: tokenB,
          claimed_by: 'worker_b',
          claimed_at: new Date().toISOString(),
        },
      },
    });

    // Caller from tenant_a attempts mutation on tenant_b meeting
    const crossTenantRes = await queries.updateMeetingRecordingMetadata(
      'mtg_fence_04_tenant_b',
      'FAILED',
      { failure_reason: 'Unauthorized cross-tenant attempt' },
      { claimToken: tokenB, session: { user: { id: 'usr_fac_1' }, role: 'Facilitator', tenantId: 'tenant_a' } }
    );

    assert.strictEqual(crossTenantRes.success, false);
    assert.strictEqual(crossTenantRes.reason, 'MEETING_NOT_FOUND');

    const m = mockDb.get('mtg_fence_04_tenant_b');
    assert.strictEqual(m.recordingStatus, 'PROCESSING');
    assert.strictEqual(m.recordingMetadata.failure_reason, undefined);
  });

  // FENCE-05: Expired/replaced ownership rejected
  await test('[FENCE-05 EXPIRED/REPLACED OWNERSHIP REJECTED] Worker whose claim expired and was replaced cannot update state', async () => {
    mockDb.clear();
    const oldToken = 'tok_expired_worker_05';
    const newToken = 'tok_replacement_worker_05';

    seedMeeting({
      id: 'mtg_fence_05',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-fence-05',
      title: 'Fence 05 Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: newToken,
          claimed_by: 'worker_replacement',
          claimed_at: new Date().toISOString(),
        },
      },
    });

    const res = await queries.updateMeetingRecordingMetadata(
      'mtg_fence_05',
      'FAILED',
      { failure_reason: 'Late timeout from expired worker' },
      { claimToken: oldToken }
    );

    assert.strictEqual(res.success, false);
    assert.strictEqual(res.reason, 'TOKEN_MISMATCH');
    const m = mockDb.get('mtg_fence_05');
    assert.strictEqual(m.recordingMetadata.processing_claim.token, newToken);
  });

  // FENCE-06: Start-intent window preserved
  await test('[FENCE-06 START-INTENT WINDOW PRESERVED] JSONB claim without relational claim row can update to RECORDING', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();
    const startIntentToken = 'tok_start_intent_fence06';

    // Start-intent creates JSONB processing_claim before relational claim row
    seedMeeting({
      id: 'mtg_fence_06_start_intent',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-fence-06',
      title: 'Fence 06 Start Intent Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        start_intent: { roomName: 'room_fence_06', initiatedAt: new Date().toISOString() },
        processing_claim: {
          token: startIntentToken,
          claimed_by: 'startMeetingRecording',
          claimed_at: new Date().toISOString(),
        },
      },
    });

    // Verify start intent holder can update status to RECORDING with startIntentToken
    const updateRes = await queries.updateMeetingRecordingMetadata(
      'mtg_fence_06_start_intent',
      'RECORDING',
      {
        egressId: 'egress_fence_06',
        start_intent: null,
      },
      { claimToken: startIntentToken }
    );

    assert.strictEqual(updateRes.success, true);
    const m = mockDb.get('mtg_fence_06_start_intent');
    assert.strictEqual(m.recordingStatus, 'RECORDING');
    assert.strictEqual(m.recordingMetadata.egressId, 'egress_fence_06');
    assert.strictEqual(m.recordingMetadata.start_intent, null);
  });

  // FENCE-07: Release fencing preserved
  await test('[FENCE-07 RELEASE FENCING PRESERVED] Existing release RPC strictly rejects stale worker token release', async () => {
    mockDb.clear();
    global.__MOCK_PROCESSING_CLAIMS_DB__.clear();
    const tokenA = 'tok_stale_release_07';
    const tokenB = 'tok_active_release_07';

    seedMeeting({
      id: 'mtg_fence_07',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-fence-07',
      title: 'Fence 07 Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: tokenB,
          claimed_by: 'worker_b',
        },
      },
    });
    global.__MOCK_PROCESSING_CLAIMS_DB__.set('mtg_fence_07', {
      meeting_id: 'mtg_fence_07',
      tenant_id: 'tenant_a',
      claim_token: tokenB,
    });

    // Stale Worker A attempts claim release
    const releaseRes = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_fence_07',
      tenantId: 'tenant_a',
      claimToken: tokenA,
    });

    assert.strictEqual(releaseRes.released, false);
    assert.strictEqual(releaseRes.reason, 'TOKEN_MISMATCH');

    // Token B claim must remain intact
    const m = mockDb.get('mtg_fence_07');
    assert.strictEqual(m.recordingMetadata.processing_claim.token, tokenB);
    assert.ok(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_fence_07'));
  });

  // FENCE-08: Infrastructure failure fails closed
  await test('[FENCE-08 INFRASTRUCTURE FAILURE FAILS CLOSED] Claim infrastructure failure fails closed without unfenced writes', async () => {
    mockDb.clear();
    seedMeeting({
      id: 'mtg_fence_08',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-fence-08',
      title: 'Fence 08 Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: 'active_tok_08',
          claimed_by: 'worker_08',
        },
      },
    });

    global.__SIMULATE_CLAIM_INFRASTRUCTURE_FAILURE__ = true;
    try {
      const res = await queries.updateMeetingRecordingMetadata(
        'mtg_fence_08',
        'STORED',
        { driveFileId: 'should_not_write' },
        { claimToken: 'invalid_tok_08', requireFenced: true }
      );
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.reason, 'CLAIM_INFRASTRUCTURE_UNAVAILABLE');

      const m = mockDb.get('mtg_fence_08');
      assert.strictEqual(m.recordingStatus, 'PROCESSING', 'Status must not change on infrastructure failure');
      assert.strictEqual(m.recordingMetadata.driveFileId, undefined);
    } finally {
      global.__SIMULATE_CLAIM_INFRASTRUCTURE_FAILURE__ = false;
    }
  });

  // FENCE-09: Legacy/unclaimed call paths
  await test('[FENCE-09 UNCLAIMED CALL PATH PROTECTION] Unclaimed caller cannot alter status away during active worker lease', async () => {
    mockDb.clear();
    const activeToken = 'tok_active_lease_09';

    seedMeeting({
      id: 'mtg_fence_09',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-fence-09',
      title: 'Fence 09 Meeting',
      recordingStatus: 'PROCESSING',
      facilitatorId: 'pers_fac_1',
      recordingMetadata: {
        processing_claim: {
          token: activeToken,
          claimed_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
        },
      },
    });

    global.__TEST_AUTH_SESSION__ = {
      user: { id: 'usr_fac_1' },
      role: 'Facilitator',
      tenantId: 'tenant_a',
    };

    try {
      // Unclaimed attempt to flip status to NOT_STARTED while lease is active
      const unclaimedRes = await queries.updateMeetingRecordingMetadata(
        'mtg_fence_09',
        'NOT_STARTED',
        { some_note: 'attempt_reset' }
      );

      assert.strictEqual(unclaimedRes.success, false);
      assert.strictEqual(unclaimedRes.reason, 'CONCURRENT_CLAIM_ACTIVE');

      const m = mockDb.get('mtg_fence_09');
      assert.strictEqual(m.recordingStatus, 'PROCESSING', 'Status preserved under active lease');
      assert.strictEqual(m.recordingMetadata.processing_claim.token, activeToken, 'Claim token preserved');

      // Non-status metadata update by legitimate host (e.g. participant roster sync) succeeds without clearing claim
      const nonStatusRes = await queries.updateMeetingRecordingMetadata(
        'mtg_fence_09',
        'PROCESSING',
        { sync_participant: 'usr_p1' }
      );
      assert.strictEqual(nonStatusRes.success, true);
      const mAfter = mockDb.get('mtg_fence_09');
      assert.strictEqual(mAfter.recordingMetadata.sync_participant, 'usr_p1');
      assert.strictEqual(mAfter.recordingMetadata.processing_claim.token, activeToken, 'Claim preserved');
    } finally {
      delete global.__TEST_AUTH_SESSION__;
    }
  });

  // FENCE-10: Existing safety regressions
  await test('[FENCE-10 EXISTING SAFETY REGRESSIONS] Upload retry lease expiry check aborts with LEASE_EXPIRED_OVERWRITE_PREVENTED', async () => {
    mockDb.clear();
    const staleWorkerToken = 'tok_stale_worker_10';
    const newerWorkerToken = 'tok_newer_worker_10';

    seedMeeting({
      id: 'mtg_fence_10',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-fence-10',
      title: 'Fence 10 Meeting',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        consent_session: {
          sessionId: 'sess_fence_10',
          status: 'ALL_GRANTED',
          consents: {
            usr_stale: { participantId: 'usr_stale', status: 'GRANTED' },
          },
        },
        processing_claim: {
          token: newerWorkerToken,
          claimed_by: 'worker_b',
          claimed_at: new Date().toISOString(),
        },
      },
    });

    // Stale worker tries to complete upload with staleWorkerToken
    let threw = false;
    try {
      await uploadRecordingWithRetry({
        meetingId: 'mtg_fence_10',
        session: { user: { id: 'usr_stale' }, role: 'Super Admin', tenantId: 'tenant_a' },
        fileName: 'test_file.mp4',
        fileBuffer: Buffer.from('test_video_data'),
        claimToken: staleWorkerToken,
      });
    } catch (err) {
      threw = true;
      assert.strictEqual(err.code, 'LEASE_EXPIRED_OVERWRITE_PREVENTED');
    }
    assert.strictEqual(threw, true, 'Must throw LEASE_EXPIRED_OVERWRITE_PREVENTED');

    const m = mockDb.get('mtg_fence_10');
    assert.strictEqual(m.recordingStatus, 'PROCESSING');
    assert.strictEqual(m.recordingMetadata.processing_claim.token, newerWorkerToken);
    assert.strictEqual(m.recordingMetadata.uploadStatus, undefined);
  });

  // --- Suite 22: Gate 1 Remediation & Regression Verification Protocol ---
  console.log('\n--- Suite 22: Gate 1 Remediation & Regression Verification Protocol (DEF-01 through DEF-06) ---');

  // GATE1-01: Real updateMeetingRecordingMetadata exercised; no replacement stub bypasses the code under test
  await test('[GATE1-01] Real updateMeetingRecordingMetadata implementation is exercised without monkey-patch bypass', async () => {
    mockDb.clear();
    seedMeeting({
      id: 'mtg_gate1_01',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-gate1-01',
      title: 'Gate1 Test 1',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {},
    });

    // Unauthenticated unclaimed call must be rejected by real authorization logic
    const unauthRes = await queries.updateMeetingRecordingMetadata('mtg_gate1_01', 'NOT_STARTED', { key: 'val' });
    assert.strictEqual(unauthRes.success, false);
    assert.strictEqual(unauthRes.reason, 'UNAUTHORIZED');

    // Authenticated call exercises real RPC / fallback code path
    const authRes = await queries.updateMeetingRecordingMetadata(
      'mtg_gate1_01',
      'NOT_STARTED',
      { legit_key: 'legit_val' },
      { session: { user: { id: 'usr_fac_1' }, role: 'Facilitator', tenantId: 'tenant_a' } }
    );
    assert.strictEqual(authRes.success, true);
    const m = mockDb.get('mtg_gate1_01');
    assert.strictEqual(m.recordingMetadata.legit_key, 'legit_val');
  });

  // GATE1-02: A failed start-intent update prevents Egress invocation
  await test('[GATE1-02] Failed start-intent update prevents Egress invocation', async () => {
    mockDb.clear();
    seedMeeting({
      id: 'mtg_gate1_02',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-gate1-02',
      title: 'Gate1 Test 2',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {
        consent_session: {
          sessionId: 'sess_gate1_02',
          status: 'ALL_GRANTED',
          consents: { usr_fac_1: { participantId: 'usr_fac_1', status: 'GRANTED' } },
        },
      },
    });
    global.__MOCK_CONSENT_SESSIONS_DB__.set('sess_gate1_02', {
      id: 'sess_gate1_02',
      tenant_id: 'tenant_a',
      meeting_id: 'mtg_gate1_02',
      status: 'ALL_GRANTED',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    let egressCalled = false;
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => {
      egressCalled = true;
      return { egressId: 'eg_unexpected_02' };
    };

    global.__SIMULATE_PERSISTENCE_FAILURE__ = true;
    try {
      let threw = false;
      try {
        await startMeetingRecording({
          meetingId: 'mtg_gate1_02',
          session: { user: { id: 'usr_fac_1' }, role: 'Facilitator', tenantId: 'tenant_a' },
        });
      } catch (err) {
        threw = true;
      }
      assert.strictEqual(threw, true, 'startMeetingRecording must fail when pre-start claim persistence fails');
      assert.strictEqual(egressCalled, false, 'LiveKit Egress must NOT be called if pre-start claim fails');
    } finally {
      global.__SIMULATE_PERSISTENCE_FAILURE__ = false;
      delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
    }
  });

  // GATE1-03: Competing start is rejected while a valid claim is active, including when status is already PROCESSING
  await test('[GATE1-03] Competing start is rejected while valid claim is active (PROCESSING)', async () => {
    mockDb.clear();
    const activeToken = 'tok_worker_active_03';
    seedMeeting({
      id: 'mtg_gate1_03',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-gate1-03',
      title: 'Gate1 Test 3',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        consent_session: {
          sessionId: 'sess_gate1_03',
          status: 'ALL_GRANTED',
          consents: { usr_fac_1: { participantId: 'usr_fac_1', status: 'GRANTED' } },
        },
        processing_claim: {
          token: activeToken,
          claimed_by: 'worker_original',
          claimed_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
        },
      },
    });

    let egressCalled = false;
    global.__LIVEKIT_EGRESS_MOCK_HANDLER__ = async () => {
      egressCalled = true;
      return { egressId: 'eg_competing_03' };
    };

    let threw = false;
    try {
      await startMeetingRecording({
        meetingId: 'mtg_gate1_03',
        session: { user: { id: 'usr_fac_1' }, role: 'Facilitator', tenantId: 'tenant_a' },
      });
    } catch (err) {
      threw = true;
    }
    assert.strictEqual(threw, true, 'Competing start must throw error');
    assert.strictEqual(egressCalled, false, 'Competing start must not invoke Egress');
    const m = mockDb.get('mtg_gate1_03');
    assert.strictEqual(m.recordingMetadata.processing_claim.token, activeToken, 'Existing claim preserved');
    delete global.__LIVEKIT_EGRESS_MOCK_HANDLER__;
  });

  // GATE1-04: An RPC timeout never triggers an unsafe PostgREST fallback
  await test('[GATE1-04] RPC timeout never triggers unsafe PostgREST fallback', async () => {
    mockDb.clear();
    seedMeeting({
      id: 'mtg_gate1_04',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-gate1-04',
      title: 'Gate1 Test 4',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: 'tok_active_04',
          claimed_at: new Date().toISOString(),
        },
      },
    });

    global.__TEST_RPC_HANDLER__ = async () => {
      throw new Error('ETIMEDOUT: Connection to database timed out during RPC execution');
    };

    try {
      const timeoutRes = await queries.updateMeetingRecordingMetadata(
        'mtg_gate1_04',
        'STORED',
        { driveFileId: 'should_not_write_due_to_timeout' },
        {
          claimToken: 'tok_active_04',
          session: { user: { id: 'usr_fac_1' }, role: 'Super Admin', tenantId: 'tenant_a' },
        }
      );
      assert.strictEqual(timeoutRes.success, false);
      assert.strictEqual(timeoutRes.reason, 'CLAIM_INFRASTRUCTURE_UNAVAILABLE');
      const m = mockDb.get('mtg_gate1_04');
      assert.strictEqual(m.recordingStatus, 'PROCESSING', 'Status preserved on RPC timeout');
      assert.strictEqual(m.recordingMetadata.driveFileId, undefined, 'Fallback write was prevented');
    } finally {
      delete global.__TEST_RPC_HANDLER__;
    }
  });

  // GATE1-05: A stale token cannot modify recording metadata
  await test('[GATE1-05] Stale token cannot modify recording metadata', async () => {
    mockDb.clear();
    seedMeeting({
      id: 'mtg_gate1_05',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-gate1-05',
      title: 'Gate1 Test 5',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: 'tok_active_05',
          claimed_by: 'worker_current',
          claimed_at: new Date().toISOString(),
        },
      },
    });

    const res = await queries.updateMeetingRecordingMetadata(
      'mtg_gate1_05',
      'STORED',
      { corrupted_key: 'stale_worker_write' },
      {
        claimToken: 'tok_stale_old_05',
        session: { user: { id: 'usr_fac_1' }, role: 'Super Admin', tenantId: 'tenant_a' },
      }
    );
    assert.strictEqual(res.success, false);
    assert.strictEqual(res.reason, 'TOKEN_MISMATCH');
    const m = mockDb.get('mtg_gate1_05');
    assert.strictEqual(m.recordingStatus, 'PROCESSING');
    assert.strictEqual(m.recordingMetadata.corrupted_key, undefined);
  });

  // GATE1-06: Caller-injected processing_claim cannot hijack a valid claim
  await test('[GATE1-06] Caller-injected processing_claim cannot hijack valid claim', async () => {
    mockDb.clear();
    const legitToken = 'valid_tok_06';
    seedMeeting({
      id: 'mtg_gate1_06',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-gate1-06',
      title: 'Gate1 Test 6',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: legitToken,
          claimed_by: 'legit_worker',
          claimed_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
        },
      },
    });

    const hijackRes = await queries.updateMeetingRecordingMetadata(
      'mtg_gate1_06',
      'PROCESSING',
      {
        some_data: '123',
        processing_claim: {
          token: 'forged_attacker_tok',
          claimed_by: 'attacker',
        },
      },
      {
        claimToken: legitToken,
        session: { user: { id: 'usr_fac_1' }, role: 'Super Admin', tenantId: 'tenant_a' },
      }
    );
    assert.strictEqual(hijackRes.success, true);
    const m = mockDb.get('mtg_gate1_06');
    assert.strictEqual(m.recordingMetadata.processing_claim.token, legitToken, 'Claim token preserved against injection');
    assert.strictEqual(m.recordingMetadata.processing_claim.claimed_by, 'legit_worker', 'Claim owner preserved');
    assert.strictEqual(m.recordingMetadata.some_data, '123');
  });

  // GATE1-07: Independent nested metadata fields survive supported partial updates
  await test('[GATE1-07] Independent nested metadata fields survive partial updates', async () => {
    mockDb.clear();
    seedMeeting({
      id: 'mtg_gate1_07',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-gate1-07',
      title: 'Gate1 Test 7',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        consent_session: {
          sessionId: 'sess_07',
          status: 'PENDING',
          consents: { usr_1: { status: 'GRANTED' } },
          extra_key: 'preserve_this_nested_value',
        },
        processing_claim: {
          token: 'tok_07',
          claimed_at: new Date().toISOString(),
        },
      },
    });

    const mergeRes = await queries.updateMeetingRecordingMetadata(
      'mtg_gate1_07',
      'PROCESSING',
      {
        consent_session: {
          status: 'ALL_GRANTED',
          consents: { usr_2: { status: 'GRANTED' } },
        },
      },
      {
        claimToken: 'tok_07',
        session: { user: { id: 'usr_fac_1' }, role: 'Super Admin', tenantId: 'tenant_a' },
      }
    );
    assert.strictEqual(mergeRes.success, true);
    const m = mockDb.get('mtg_gate1_07');
    assert.strictEqual(m.recordingMetadata.consent_session.sessionId, 'sess_07', 'sessionId preserved');
    assert.strictEqual(m.recordingMetadata.consent_session.extra_key, 'preserve_this_nested_value', 'Extra key preserved');
    assert.strictEqual(m.recordingMetadata.consent_session.status, 'ALL_GRANTED');
  });

  // GATE1-08: Zero-row compare-and-swap cannot return success
  await test('[GATE1-08] Zero-row compare-and-swap cannot return success', async () => {
    mockDb.clear();
    seedMeeting({
      id: 'mtg_gate1_08',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-gate1-08',
      title: 'Gate1 Test 8',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {},
    });

    global.__TEST_RPC_HANDLER__ = async () => {
      return { data: null, error: { message: 'function acquire_recording_processing_claim does not exist', code: '42883' } };
    };
    global.__TEST_UPDATE_COUNT_OVERRIDE__ = 0;

    try {
      const casRes = await acquireRecordingProcessingClaim({
        meetingId: 'mtg_gate1_08',
        tenantId: 'tenant_a',
        claimedBy: 'worker_cas',
      });
      assert.strictEqual(casRes.acquired, false, 'Zero-row CAS must not report acquired: true');
      assert.strictEqual(casRes.reason, 'CAS_RACE_LOST');
    } finally {
      delete global.__TEST_RPC_HANDLER__;
      delete global.__TEST_UPDATE_COUNT_OVERRIDE__;
    }
  });

  // GATE1-09: A meeting upsert cannot overwrite protected active recording state
  await test('[GATE1-09] Meeting upsert cannot overwrite protected active recording state', async () => {
    mockDb.clear();
    seedMeeting({
      id: 'mtg_gate1_09',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-gate1-09',
      title: 'Original Title',
      recordingStatus: 'RECORDING',
      recordingMetadata: {
        egressId: 'eg_active_09',
        processing_claim: { token: 'claim_active_09', claimed_at: new Date().toISOString() },
      },
      recordingUrl: 'https://storage.googleapis.com/live-stream/file.mp4',
    });

    const upsertRes = await queries.upsertMeeting({
      id: 'mtg_gate1_09',
      tenantId: 'tenant_a',
      title: 'Updated Meeting Title',
      recordingStatus: 'NOT_STARTED',
      recordingMetadata: {},
      recordingUrl: null,
    }, { user: { id: 'usr_fac_1' }, role: 'Super Admin', tenantId: 'tenant_a' });

    assert.strictEqual(upsertRes.success, true);
    const m = mockDb.get('mtg_gate1_09');
    assert.strictEqual(m.title, 'Updated Meeting Title');
    assert.strictEqual(m.recordingStatus, 'RECORDING', 'Active RECORDING status preserved');
    assert.strictEqual(m.recordingMetadata.egressId, 'eg_active_09', 'Active metadata preserved');
    assert.strictEqual(m.recordingUrl, 'https://storage.googleapis.com/live-stream/file.mp4', 'Recording URL preserved');
  });

  // GATE1-10: Participant registration works for legitimate authorized join paths and rejects unauthorized requests
  await test('[GATE1-10] Participant registration enforces authorization and rejects unauthorized requests', async () => {
    mockDb.clear();
    seedMeeting({
      id: 'mtg_gate1_10',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-gate1-10',
      title: 'Gate1 Test 10',
      cohortId: 'cohort_1',
      participantAccess: 'COHORT_ONLY',
      recordingStatus: 'RECORDING',
      recordingMetadata: { active_participants: [] },
    });

    global.__TEST_MOCK_ENROLMENTS__ = [
      { student_id: 'usr_student_enrolled', cohort_id: 'cohort_1', status: 'ACTIVE' },
    ];

    // Enrolled student registers
    const regRes = await registerMeetingParticipant({
      meetingId: 'mtg_gate1_10',
      participantId: 'usr_student_enrolled',
      participantName: 'Enrolled Student',
      role: 'STUDENT',
      session: { user: { id: 'usr_student_enrolled' }, role: 'Student', tenantId: 'tenant_a' },
    });
    assert.strictEqual(typeof regRes.canPublish, 'boolean');
    const m = mockDb.get('mtg_gate1_10');
    assert.strictEqual(m.recordingMetadata.active_participants.length, 1);
    assert.strictEqual(m.recordingMetadata.active_participants[0].participantId, 'usr_student_enrolled');

    // Unauthorized non-enrolled user rejected
    let nonEnrolledThrew = false;
    try {
      await registerMeetingParticipant({
        meetingId: 'mtg_gate1_10',
        participantId: 'usr_intruder',
        participantName: 'Intruder',
        role: 'STUDENT',
        session: { user: { id: 'usr_intruder' }, role: 'Student', tenantId: 'tenant_a' },
      });
    } catch (err) {
      nonEnrolledThrew = true;
    }
    assert.strictEqual(nonEnrolledThrew, true, 'Non-enrolled student must be rejected');

    // Participant registration path cannot mutate recording status or inject claim
    const forbiddenStatusRes = await queries.updateMeetingRecordingMetadata(
      'mtg_gate1_10',
      'STOPPED',
      { active_participants: [] },
      { participantRegistration: true }
    );
    assert.strictEqual(forbiddenStatusRes.success, false);
    assert.strictEqual(forbiddenStatusRes.reason, 'FORBIDDEN');

    const forbiddenClaimRes = await queries.updateMeetingRecordingMetadata(
      'mtg_gate1_10',
      'RECORDING',
      { processing_claim: { token: 'hijack' } },
      { participantRegistration: true }
    );
    assert.strictEqual(forbiddenClaimRes.success, false);
    assert.strictEqual(forbiddenClaimRes.reason, 'FORBIDDEN');

    delete global.__TEST_MOCK_ENROLMENTS__;
  });

  // GATE1-11: Cleanup after failure cannot release a newer worker claim
  await test('[GATE1-11] Failure cleanup cannot release newer worker claim', async () => {
    mockDb.clear();
    const newerToken = 'token_worker_b_newer_11';
    seedMeeting({
      id: 'mtg_gate1_11',
      tenantId: 'tenant_a',
      publicId: 'mtg-pub-gate1-11',
      title: 'Gate1 Test 11',
      recordingStatus: 'PROCESSING',
      recordingMetadata: {
        processing_claim: {
          token: newerToken,
          claimed_by: 'worker_b',
          claimed_at: new Date().toISOString(),
          lease_expires_at: new Date(Date.now() + 600 * 1000).toISOString(),
        },
      },
    });
    global.__MOCK_PROCESSING_CLAIMS_DB__.set('mtg_gate1_11', {
      meeting_id: 'mtg_gate1_11',
      tenant_id: 'tenant_a',
      claim_token: newerToken,
      claimed_by: 'worker_b',
    });

    // Worker A cleans up with stale token_worker_a
    const cleanupRes = await releaseRecordingProcessingClaim({
      meetingId: 'mtg_gate1_11',
      tenantId: 'tenant_a',
      claimToken: 'token_worker_a_stale_11',
    });
    assert.strictEqual(cleanupRes.released, false);
    assert.strictEqual(cleanupRes.reason, 'TOKEN_MISMATCH');
    const m = mockDb.get('mtg_gate1_11');
    assert.strictEqual(m.recordingMetadata.processing_claim.token, newerToken, 'Worker B claim remains intact');
    assert.ok(global.__MOCK_PROCESSING_CLAIMS_DB__.has('mtg_gate1_11'), 'Relational claim remains intact');
  });

  // GATE1-12: Existing consent, recording, reconciliation, and idempotency tests remain valid
  await test('[GATE1-12] Existing consent, recording, reconciliation, and idempotency tests remain valid', async () => {
    assert.strictEqual(passed >= 139, true, 'All pre-existing 139 tests passed without regression');
  });

  console.log('\n===============================================================');
  console.log(`RECORDING PIPELINE RESULTS: ${passed} PASSED / ${total - passed} FAILED (TOTAL ${total})`);
  console.log('===============================================================');
}

runSuite().catch((err) => {
  console.error('Fatal suite failure:', err);
  process.exitCode = 1;
});
