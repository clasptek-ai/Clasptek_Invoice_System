'use client';

/**
 * app/audit-log/AuditLogPageClient.tsx
 * Client Component for Immutable Financial Audit Log
 * Phase 9B: Administration & Governance Module Migration
 */

import React, { useState, useMemo } from 'react';
import { AuditRecord } from '@/lib/audit/queries';
import { downloadSafeCsv } from '@/lib/utils/csv';
import { usePagination } from '@/lib/hooks/usePagination';
import { Pagination } from '@/components/tables/Pagination';

interface AuditLogProps {
  initialLogs: AuditRecord[];
}

export function AuditLogPageClient({ initialLogs }: AuditLogProps) {
  const [logs] = useState<AuditRecord[]>(initialLogs);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterAction, setFilterAction] = useState('ALL');

  // Unique actions for filtering
  const uniqueActions = useMemo(() => {
    const set = new Set<string>();
    logs.forEach((l) => set.add(l.action));
    return Array.from(set).sort();
  }, [logs]);

  // Filtered list
  const filteredLogs = useMemo(() => {
    return logs.filter((log) => {
      if (filterAction !== 'ALL' && log.action !== filterAction) return false;
      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const matchAction = log.action.toLowerCase().includes(query);
        const matchEntity = (log.entityType || '').toLowerCase().includes(query);
        const matchRef = (log.entityId || '').toLowerCase().includes(query);
        const matchName = (log.entityName || '').toLowerCase().includes(query);
        const matchActor = (log.actorRole || '').toLowerCase().includes(query);
        if (!matchAction && !matchEntity && !matchRef && !matchName && !matchActor) return false;
      }
      return true;
    });
  }, [logs, filterAction, searchTerm]);

  const {
    currentPage,
    pageSize,
    paginatedItems: paginatedLogs,
    setPage,
    setPageSize,
  } = usePagination(filteredLogs, {
    initialPageSize: 25,
    resetDeps: [logs, filterAction, searchTerm],
  });

  // Export CSV using certified formula injection defense
  const handleExportCsv = () => {
    const headers = ['Timestamp', 'Action', 'Entity Type', 'Reference / ID', 'Entity Name', 'Actor Role', 'Reason', 'Source'];
    const rows = filteredLogs.map((l) => [
      new Date(l.createdAt).toLocaleString('en-GB'),
      l.action,
      l.entityType,
      l.entityId,
      l.entityName || '',
      l.actorRole,
      l.reason || '',
      l.source,
    ]);
    downloadSafeCsv('Audit_Log', headers, rows);
  };

  return (
    <div style={{ padding: '24px 28px', maxWidth: '1440px', margin: '0 auto' }}>
      <div className="cp-card" style={{ background: 'var(--surface-0)', border: '1px solid var(--border)', borderRadius: '8px', padding: '20px' }}>
        <div className="cp-card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div className="cp-section-title" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--primary)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              📜 Immutable Financial Audit Log
            </div>
            <div className="cp-section-desc" style={{ fontSize: '12.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
              Chronological history of all financial mutations, invoices, payments, enquiries, payslips, and banking settings.
            </div>
          </div>

          <button
            className="cp-btn sm secondary"
            onClick={handleExportCsv}
            style={{
              padding: '8px 14px',
              borderRadius: '4px',
              border: '1px solid var(--border)',
              background: 'var(--surface-2)',
              cursor: 'pointer',
              fontSize: '12.5px',
              fontWeight: 600,
            }}
          >
            📥 Export Audit CSV
          </button>
        </div>

        {/* Search and Action Filter */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '14px', flexWrap: 'wrap', alignItems: 'center' }}>
          <div style={{ flex: 1, minWidth: '220px' }}>
            <input
              type="text"
              placeholder="Search action, entity type, reference ID, name..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12.5px' }}
            />
          </div>
          <div style={{ minWidth: '160px' }}>
            <select
              value={filterAction}
              onChange={(e) => setFilterAction(e.target.value)}
              style={{ width: '100%', padding: '7px 10px', border: '1px solid var(--border)', borderRadius: '4px', fontSize: '12.5px' }}
            >
              <option value="ALL">All Actions ({logs.length})</option>
              {uniqueActions.map((act) => (
                <option key={act} value={act}>
                  {act}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Desktop & Tablet Audit Table */}
        <div className="cp-table-wrap cp-table-desktop" style={{ overflowX: 'auto' }}>
          <table className="cp-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12.5px' }}>
            <thead>
              <tr style={{ background: 'var(--surface-1)', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                <th style={{ padding: '10px' }}>Timestamp</th>
                <th style={{ padding: '10px' }}>Action</th>
                <th className="cp-col-secondary" style={{ padding: '10px' }}>Entity</th>
                <th style={{ padding: '10px' }}>Reference</th>
                <th style={{ padding: '10px' }}>Actor</th>
                <th className="cp-col-tertiary" style={{ padding: '10px' }}>Role</th>
              </tr>
            </thead>
            <tbody>
              {filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan={6} style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
                    No audit records matching the current filter.
                  </td>
                </tr>
              ) : (
                paginatedLogs.map((a) => (
                  <tr key={a.id} style={{ borderBottom: '1px solid var(--border)' }}>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '11.5px', color: 'var(--text-secondary)' }}>
                      {new Date(a.createdAt).toLocaleString('en-GB')}
                    </td>
                    <td style={{ padding: '10px', fontWeight: 700, color: 'var(--primary)' }}>
                      {a.action}
                    </td>
                    <td className="cp-col-secondary" style={{ padding: '10px' }}>{a.entityType || 'General'}</td>
                    <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: '11.5px' }}>
                      {a.entityId || 'N/A'} {a.entityName ? `(${a.entityName})` : ''}
                    </td>
                    <td style={{ padding: '10px' }}>
                      {a.actorId ? `User (${a.actorId.slice(0, 8)})` : 'System'}
                    </td>
                    <td className="cp-col-tertiary" style={{ padding: '10px' }}>
                      <span
                        className="cp-pill"
                        style={{
                          padding: '2px 8px',
                          borderRadius: '12px',
                          fontSize: '11px',
                          fontWeight: 700,
                          background: '#EFF6FF',
                          color: '#1D4ED8',
                        }}
                      >
                        {a.actorRole || 'Staff'}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Mobile Vertical Cards */}
        <div className="cp-cards-mobile">
          {filteredLogs.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)' }}>
              No audit records matching the current filter.
            </div>
          ) : (
            paginatedLogs.map((a) => (
              <div key={a.id} className="cp-mobile-record-card">
                <div className="cp-mobile-record-header">
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '13.5px', color: 'var(--primary)' }}>
                      {a.action}
                    </div>
                    <div style={{ fontFamily: 'monospace', fontSize: '11px', color: 'var(--text-muted)' }}>
                      {new Date(a.createdAt).toLocaleString('en-GB')}
                    </div>
                  </div>
                  <span
                    className="cp-pill"
                    style={{
                      padding: '2px 8px',
                      borderRadius: '12px',
                      fontSize: '10.5px',
                      fontWeight: 700,
                      background: '#EFF6FF',
                      color: '#1D4ED8',
                    }}
                  >
                    {a.actorRole || 'Staff'}
                  </span>
                </div>

                <div className="cp-mobile-record-grid">
                  <div className="cp-mobile-record-field">
                    <span className="cp-mobile-record-label">Entity</span>
                    <span className="cp-mobile-record-value">{a.entityType || 'General'}</span>
                  </div>
                  <div className="cp-mobile-record-field">
                    <span className="cp-mobile-record-label">Actor</span>
                    <span className="cp-mobile-record-value">{a.actorId ? `User (${a.actorId.slice(0, 8)})` : 'System'}</span>
                  </div>
                  <div className="cp-mobile-record-field" style={{ gridColumn: 'span 2' }}>
                    <span className="cp-mobile-record-label">Reference</span>
                    <span className="cp-mobile-record-value" style={{ fontFamily: 'monospace', fontSize: '11px' }}>
                      {a.entityId || 'N/A'} {a.entityName ? `(${a.entityName})` : ''}
                    </span>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Standard Pagination */}
        <Pagination
          currentPage={currentPage}
          pageSize={pageSize}
          totalRecords={filteredLogs.length}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
          entityLabel="logs"
        />
      </div>
    </div>
  );
}
