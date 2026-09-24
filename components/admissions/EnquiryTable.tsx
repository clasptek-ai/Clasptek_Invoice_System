/**
 * components/admissions/EnquiryTable.tsx — Phase 3 & 9G
 * Responsive table of enquiries.
 * Uses genuine .cp-table-wrap and .cp-table styling.
 */

'use client';

import type { Enquiry } from '@/types/admissions';
import { StatusBadge } from './StatusBadge';

interface EnquiryTableProps {
  enquiries: Enquiry[];
  onSelect: (enquiry: Enquiry) => void;
  isLoading?: boolean;
}

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

function formatWhatsApp(phone: string | null): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0') && digits.length === 11) {
    return `https://wa.me/234${digits.slice(1)}`;
  }
  if (digits.startsWith('234')) {
    return `https://wa.me/${digits}`;
  }
  return `https://wa.me/${digits}`;
}

export function EnquiryTable({ enquiries, onSelect, isLoading }: EnquiryTableProps) {
  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '60px 20px', color: 'var(--text-muted)' }} aria-live="polite">
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <span className="cp-spinner cp-spinner-md" aria-hidden="true" />
          <span style={{ fontSize: '13px', fontWeight: 600 }}>Loading enquiries...</span>
        </div>
      </div>
    );
  }

  if (enquiries.length === 0) {
    return (
      <div className="cp-empty-state">
        <div className="cp-empty-icon" aria-hidden="true">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--text-muted, #94A3B8)' }}>
            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
            <polyline points="22,6 12,13 2,6" />
          </svg>
        </div>
        <div className="cp-empty-title">No enquiries found</div>
        <div className="cp-empty-desc">
          Try adjusting your search or filter criteria.
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Desktop & Tablet Table */}
      <div className="cp-table-wrap cp-table-desktop">
        <table className="cp-table">
          <thead>
            <tr>
              <th scope="col">Prospect</th>
              <th scope="col">Contact</th>
              <th scope="col">Programme</th>
              <th scope="col">Source</th>
              <th scope="col">Status</th>
              <th scope="col">Date</th>
              <th scope="col" style={{ textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {enquiries.map((enquiry) => {
              const wa = formatWhatsApp(enquiry.phone);
              return (
                <tr
                  key={enquiry.id}
                  style={{ cursor: 'pointer' }}
                  onClick={() => onSelect(enquiry)}
                >
                  <td>
                    <div style={{ fontWeight: 700, color: 'var(--text-primary, #0F172A)' }}>
                      {enquiry.student_name}
                    </div>
                    {enquiry.notes && (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)', maxWidth: '240px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {enquiry.notes.slice(0, 60)}{enquiry.notes.length > 60 ? '…' : ''}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: '12px', color: 'var(--text-primary, #0F172A)' }}>{enquiry.email ?? '—'}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)' }}>{enquiry.phone ?? '—'}</div>
                  </td>
                  <td style={{ fontSize: '12px' }}>
                    {enquiry.programme_name ?? '—'}
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted, #64748B)' }}>
                    {enquiry.source ?? '—'}
                  </td>
                  <td>
                    <StatusBadge status={enquiry.status} />
                  </td>
                  <td style={{ fontSize: '12px', color: 'var(--text-muted, #64748B)' }}>
                    {formatDate(enquiry.updated_at)}
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '8px' }}>
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          style={{ textDecoration: 'none', color: '#16A34A', display: 'inline-flex', alignItems: 'center' }}
                          aria-label={`WhatsApp ${enquiry.student_name}`}
                          title="WhatsApp"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                          </svg>
                        </a>
                      )}
                      {enquiry.email && (
                        <a
                          href={`mailto:${enquiry.email}`}
                          onClick={(e) => e.stopPropagation()}
                          style={{ textDecoration: 'none', color: 'var(--text-muted, #64748B)', display: 'inline-flex', alignItems: 'center' }}
                          aria-label={`Email ${enquiry.student_name}`}
                          title="Email"
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                            <polyline points="22,6 12,13 2,6" />
                          </svg>
                        </a>
                      )}
                      <button
                        type="button"
                        className="cp-btn sm secondary"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelect(enquiry);
                        }}
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                        aria-label={`Open enquiry for ${enquiry.student_name}`}
                      >
                        View →
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile Card Stack */}
      <div className="cp-cards-mobile">
        {enquiries.map((enquiry) => {
          const wa = formatWhatsApp(enquiry.phone);
          return (
            <div
              key={enquiry.id}
              className="cp-card"
              style={{ padding: '14px', cursor: 'pointer' }}
              onClick={() => onSelect(enquiry)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(enquiry)}
              aria-label={`View enquiry for ${enquiry.student_name}`}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '8px', marginBottom: '8px' }}>
                <div>
                  <p style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary, #0F172A)', margin: 0 }}>
                    {enquiry.student_name}
                  </p>
                  <p style={{ fontSize: '12px', color: 'var(--text-muted, #64748B)', margin: '2px 0 0 0' }}>
                    {enquiry.programme_name ?? 'No programme'}
                  </p>
                </div>
                <StatusBadge status={enquiry.status} />
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', fontSize: '12px', color: 'var(--text-muted, #64748B)', marginBottom: '8px' }}>
                {enquiry.email && <span>{enquiry.email}</span>}
                {enquiry.phone && <span>{enquiry.phone}</span>}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '8px', paddingTop: '8px', borderTop: '1px solid var(--border)' }}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted, #64748B)' }}>{formatDate(enquiry.updated_at)}</span>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none', color: '#16A34A', display: 'inline-flex' }} aria-label="WhatsApp">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z" />
                      </svg>
                    </a>
                  )}
                  {enquiry.email && (
                    <a href={`mailto:${enquiry.email}`} onClick={(e) => e.stopPropagation()} style={{ textDecoration: 'none', color: 'var(--text-muted, #64748B)', display: 'inline-flex' }} aria-label="Email">
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" />
                        <polyline points="22,6 12,13 2,6" />
                      </svg>
                    </a>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}
