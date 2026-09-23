/**
 * components/admissions/EnquiryTable.tsx — Phase 3
 * Responsive table of enquiries.
 * Desktop: full table. Mobile: card stack layout.
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
      <div className="flex items-center justify-center py-16 text-gray-400" aria-live="polite">
        <div className="flex items-center gap-3">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" aria-hidden="true" />
          <span className="text-sm">Loading enquiries...</span>
        </div>
      </div>
    );
  }

  if (enquiries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center" role="status">
        <div className="text-4xl mb-3" aria-hidden="true">📭</div>
        <p className="text-gray-700 font-semibold text-base">No enquiries found</p>
        <p className="text-gray-400 text-sm mt-1">
          Try adjusting your search or filter criteria.
        </p>
      </div>
    );
  }

  return (
    <>
      {/* Desktop Table */}
      <div className="hidden md:block overflow-x-auto rounded-lg border border-gray-100">
        <table className="min-w-full divide-y divide-gray-100">
          <thead className="bg-gray-50">
            <tr>
              {['Prospect', 'Contact', 'Programme', 'Source', 'Status', 'Date', ''].map((h) => (
                <th
                  key={h}
                  scope="col"
                  className="px-4 py-3 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-50">
            {enquiries.map((enquiry) => {
              const wa = formatWhatsApp(enquiry.phone);
              return (
                <tr
                  key={enquiry.id}
                  className="hover:bg-blue-50 transition-colors cursor-pointer group"
                  onClick={() => onSelect(enquiry)}
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="font-semibold text-sm text-gray-900 group-hover:text-blue-700">
                      {enquiry.student_name}
                    </div>
                    {enquiry.notes && (
                      <div className="text-xs text-gray-400 truncate max-w-[180px]">
                        {enquiry.notes.slice(0, 60)}{enquiry.notes.length > 60 ? '…' : ''}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <div className="text-xs text-gray-600">{enquiry.email ?? '—'}</div>
                    <div className="text-xs text-gray-500">{enquiry.phone ?? '—'}</div>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-600">
                    {enquiry.programme_name ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-500">
                    {enquiry.source ?? '—'}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <StatusBadge status={enquiry.status} />
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-xs text-gray-400">
                    {formatDate(enquiry.updated_at)}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap text-right">
                    <div className="flex items-center justify-end gap-2">
                      {wa && (
                        <a
                          href={wa}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-emerald-600 hover:text-emerald-700 text-sm"
                          aria-label={`WhatsApp ${enquiry.student_name}`}
                          title="WhatsApp"
                        >
                          💬
                        </a>
                      )}
                      {enquiry.email && (
                        <a
                          href={`mailto:${enquiry.email}`}
                          onClick={(e) => e.stopPropagation()}
                          className="text-blue-500 hover:text-blue-700 text-sm"
                          aria-label={`Email ${enquiry.student_name}`}
                          title="Email"
                        >
                          ✉️
                        </a>
                      )}
                      <button
                        className="text-xs font-medium text-blue-600 hover:text-blue-800 bg-blue-50 hover:bg-blue-100 px-2 py-1 rounded transition-colors"
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
      <div className="md:hidden space-y-3">
        {enquiries.map((enquiry) => {
          const wa = formatWhatsApp(enquiry.phone);
          return (
            <div
              key={enquiry.id}
              className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 cursor-pointer hover:border-blue-200 hover:shadow-md transition-all"
              onClick={() => onSelect(enquiry)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => e.key === 'Enter' && onSelect(enquiry)}
              aria-label={`View enquiry for ${enquiry.student_name}`}
            >
              <div className="flex items-start justify-between gap-2 mb-2">
                <div>
                  <p className="font-semibold text-sm text-gray-900">{enquiry.student_name}</p>
                  <p className="text-xs text-gray-500">{enquiry.programme_name ?? 'No programme'}</p>
                </div>
                <StatusBadge status={enquiry.status} />
              </div>
              <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-2">
                {enquiry.email && <span>{enquiry.email}</span>}
                {enquiry.phone && <span>{enquiry.phone}</span>}
              </div>
              <div className="flex items-center justify-between mt-2">
                <span className="text-xs text-gray-400">{formatDate(enquiry.updated_at)}</span>
                <div className="flex gap-2">
                  {wa && (
                    <a href={wa} target="_blank" rel="noopener noreferrer" onClick={(e) => e.stopPropagation()} className="text-emerald-600 text-sm" aria-label="WhatsApp">💬</a>
                  )}
                  {enquiry.email && (
                    <a href={`mailto:${enquiry.email}`} onClick={(e) => e.stopPropagation()} className="text-blue-500 text-sm" aria-label="Email">✉️</a>
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
