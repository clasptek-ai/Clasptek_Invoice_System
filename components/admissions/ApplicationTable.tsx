/**
 * components/admissions/ApplicationTable.tsx — Phase 3
 * Accessible, responsive data table for CRM Intake Applications.
 */

'use client';

import type { IntakeApplication } from '@/types/admissions';
import { StatusBadge } from '@/components/admissions/StatusBadge';
import { APPLICATION_SOURCE_LABELS } from '@/types/admissions';

interface ApplicationTableProps {
  applications: IntakeApplication[];
  totalCount: number;
  currentPage: number;
  pageSize?: number;
  selectedId?: string | null;
  onSelect: (application: IntakeApplication) => void;
  onPageChange: (page: number) => void;
}

const SOURCE_COLORS: Record<string, string> = {
  WEB_INTAKE: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  GOOGLE_FORM: 'bg-blue-50 text-blue-700 border-blue-200',
  STAFF_ENTRY: 'bg-purple-50 text-purple-700 border-purple-200',
  PORTAL: 'bg-amber-50 text-amber-700 border-amber-200',
};

const MODE_LABELS: Record<string, string> = {
  IN_PERSON: 'In-person',
  ONLINE: 'Online',
  HYBRID: 'Hybrid',
};

export function ApplicationTable({
  applications,
  totalCount,
  currentPage,
  pageSize = 25,
  selectedId,
  onSelect,
  onPageChange,
}: ApplicationTableProps) {
  const totalPages = Math.ceil(totalCount / pageSize);
  const fromRecord = totalCount === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const toRecord = Math.min(currentPage * pageSize, totalCount);

  if (applications.length === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200/80 p-12 text-center shadow-sm">
        <div className="w-12 h-12 mx-auto rounded-full bg-blue-50 flex items-center justify-center text-blue-600 text-xl mb-3">
          📋
        </div>
        <h3 className="text-base font-semibold text-gray-900">No applications found</h3>
        <p className="text-sm text-gray-500 mt-1 max-w-sm mx-auto">
          No intake applications match your current search or filter criteria. Try adjusting or clearing your filters.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200/80 shadow-sm overflow-hidden flex flex-col">
      {/* Desktop / Tablet Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm text-gray-600 divide-y divide-gray-100">
          <thead className="bg-gray-50/80 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            <tr>
              <th scope="col" className="px-4 py-3.5">
                Application #
              </th>
              <th scope="col" className="px-4 py-3.5">
                Applicant
              </th>
              <th scope="col" className="px-4 py-3.5">
                Programme
              </th>
              <th scope="col" className="px-4 py-3.5">
                Source
              </th>
              <th scope="col" className="px-4 py-3.5">
                Status
              </th>
              <th scope="col" className="px-4 py-3.5">
                Submitted
              </th>
              <th scope="col" className="px-4 py-3.5 text-right">
                Action
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {applications.map((app) => {
              const isSelected = selectedId === app.id;
              const sourceLabel = APPLICATION_SOURCE_LABELS[app.source] ?? app.source;
              const sourceStyle = SOURCE_COLORS[app.source] ?? 'bg-gray-100 text-gray-600 border-gray-200';
              const formattedDate = app.submitted_at
                ? new Date(app.submitted_at).toLocaleDateString('en-GB', {
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '—';

              return (
                <tr
                  key={app.id}
                  onClick={() => onSelect(app)}
                  className={`cursor-pointer transition-colors group ${
                    isSelected ? 'bg-blue-50/60' : 'hover:bg-gray-50/60'
                  }`}
                >
                  {/* Application Number */}
                  <td className="px-4 py-3.5 font-mono text-xs font-bold text-gray-900 whitespace-nowrap">
                    <span className="bg-gray-100 px-2 py-0.5 rounded border border-gray-200 text-gray-800">
                      {app.application_number}
                    </span>
                  </td>

                  {/* Applicant Details */}
                  <td className="px-4 py-3.5">
                    <div className="font-medium text-gray-900 group-hover:text-blue-600 transition-colors">
                      {app.first_name} {app.last_name}
                    </div>
                    <div className="text-xs text-gray-400 flex flex-wrap gap-x-2 mt-0.5">
                      {app.email && <span>{app.email}</span>}
                      {app.phone && <span>• {app.phone}</span>}
                    </div>
                  </td>

                  {/* Programme */}
                  <td className="px-4 py-3.5">
                    <div className="text-xs font-semibold text-gray-800 line-clamp-1">
                      {app.programme_name || 'General Application'}
                    </div>
                    <div className="text-[11px] text-gray-400 mt-0.5">
                      {MODE_LABELS[app.delivery_mode] || app.delivery_mode}
                      {app.preferred_schedule ? ` • ${app.preferred_schedule}` : ''}
                    </div>
                  </td>

                  {/* Source */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium border ${sourceStyle}`}
                    >
                      {sourceLabel}
                    </span>
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3.5 whitespace-nowrap">
                    <StatusBadge status={app.status} />
                  </td>

                  {/* Submitted Date */}
                  <td className="px-4 py-3.5 text-xs text-gray-500 whitespace-nowrap">
                    {formattedDate}
                  </td>

                  {/* Action */}
                  <td className="px-4 py-3.5 text-right whitespace-nowrap">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(app);
                      }}
                      className="px-2.5 py-1 text-xs font-medium text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors"
                    >
                      Review
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Pagination Footer */}
      <div className="px-4 py-3 bg-gray-50/50 border-t border-gray-100 flex items-center justify-between text-xs text-gray-500">
        <div>
          Showing <span className="font-semibold text-gray-800">{fromRecord}</span> to{' '}
          <span className="font-semibold text-gray-800">{toRecord}</span> of{' '}
          <span className="font-semibold text-gray-800">{totalCount}</span> applications
        </div>

        {totalPages > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              className="px-2.5 py-1 border border-gray-200 rounded-md bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>
            <span className="px-2 font-medium text-gray-700">
              Page {currentPage} of {totalPages}
            </span>
            <button
              type="button"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              className="px-2.5 py-1 border border-gray-200 rounded-md bg-white hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
