/**
 * app/verify-certificate/[identifier]/page.tsx — Phase 9D
 * Public Credential Verification Page
 *
 * Provides tamper-evident, cryptographic verification of issued Clasptek certificates.
 * Open to public / employers / verification bodies without authentication.
 * PRIVACY GUARANTEE: Zero exposure of private student data (email, phone, finances, tenant UUID).
 */

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { verifyCertificatePublic } from '@/lib/certificates/certificate-queries';
import { formatCertificateOrdinalDate } from '@/lib/certificates/constants';

export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  return {
    title: `Credential Verification — ${decodeURIComponent(identifier)} | Clasptek Academy`,
    description: 'Authoritative cryptographic credential verification for Clasptek Academy diplomas.',
  };
}

export default async function PublicVerifyCertificatePage({
  params,
}: {
  params: Promise<{ identifier: string }>;
}) {
  const { identifier } = await params;
  const decoded = decodeURIComponent(identifier || '');

  const result = await verifyCertificatePublic(decoded);

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#F8FAFC',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px 16px',
        fontFamily: "'Montserrat', sans-serif",
      }}
    >
      <div style={{ maxWidth: '640px', width: '100%' }}>
        {/* Clasptek Academy Branding */}
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ display: 'inline-block', marginBottom: '12px' }}>
            <Image
              src="/assets/clasptek-official-logo.png"
              alt="Clasptek Academy"
              width={160}
              height={44}
              style={{ height: 'auto', width: '160px' }}
              priority
            />
          </div>
          <div style={{ fontSize: '13px', fontWeight: 700, color: '#080B78', letterSpacing: '1.5px', textTransform: 'uppercase' }}>
            Authoritative Credential Verification Service
          </div>
        </div>

        {/* Verification Card */}
        <div
          style={{
            backgroundColor: '#FFFFFF',
            borderRadius: '12px',
            border: '1px solid #E2E8F0',
            boxShadow: '0 8px 30px rgba(0,0,0,0.06)',
            overflow: 'hidden',
          }}
        >
          {result.found && result.isValid ? (
            <div>
              {/* Green Verified Banner */}
              <div
                style={{
                  backgroundColor: '#ECFDF5',
                  borderBottom: '1px solid #A7F3D0',
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: '#059669',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  ✔
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#065F46' }}>
                    Officially Verified &amp; Active
                  </div>
                  <div style={{ fontSize: '12px', color: '#047857', marginTop: '2px' }}>
                    Tamper-evident credential confirmed in Clasptek registry.
                  </div>
                </div>
              </div>

              {/* Credential Details */}
              <div style={{ padding: '24px' }}>
                <div style={{ marginBottom: '18px', paddingBottom: '16px', borderBottom: '1px solid #F1F5F9' }}>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                    Awarded Recipient
                  </div>
                  <div style={{ fontSize: '20px', fontWeight: 800, color: '#14213D', marginTop: '4px' }}>
                    {result.studentName}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Certificate Title
                    </div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#1E293B', marginTop: '2px' }}>
                      {result.certificateTitle}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Certificate Number
                    </div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, fontFamily: 'monospace', color: '#080B78', marginTop: '2px' }}>
                      {result.certificateNumber}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Professional Credential Role
                    </div>
                    <div style={{ fontSize: '13.5px', fontWeight: 700, color: '#C1272D', marginTop: '2px' }}>
                      {result.certificateRole}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Programme of Study
                    </div>
                    <div style={{ fontSize: '13.5px', fontWeight: 600, color: '#1E293B', marginTop: '2px' }}>
                      {result.programmeName}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Date of Issuance
                    </div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: '#475569', marginTop: '2px' }}>
                      {formatCertificateOrdinalDate(result.issueDate)}
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Verification Token
                    </div>
                    <div style={{ fontSize: '11px', fontFamily: 'monospace', color: '#64748B', marginTop: '2px' }}>
                      <code>{result.verificationToken ? result.verificationToken.slice(0, 20) + '...' : 'N/A'}</code>
                    </div>
                  </div>
                </div>

                {result.certificateDescription && (
                  <div style={{ marginTop: '18px', paddingTop: '16px', borderTop: '1px solid #F1F5F9' }}>
                    <div style={{ fontSize: '11px', fontWeight: 700, color: '#64748B', textTransform: 'uppercase' }}>
                      Core Competencies Verified
                    </div>
                    <div style={{ fontSize: '12.5px', color: '#334155', marginTop: '4px', lineHeight: '1.5' }}>
                      {result.certificateDescription}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : result.found && result.status === 'REVOKED' ? (
            <div>
              {/* Red Revoked Banner */}
              <div
                style={{
                  backgroundColor: '#FEF2F2',
                  borderBottom: '1px solid #FECACA',
                  padding: '20px 24px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '14px',
                }}
              >
                <div
                  style={{
                    width: '44px',
                    height: '44px',
                    borderRadius: '50%',
                    backgroundColor: '#DC2626',
                    color: '#FFFFFF',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '22px',
                    fontWeight: 800,
                    flexShrink: 0,
                  }}
                >
                  ✖
                </div>
                <div>
                  <div style={{ fontSize: '18px', fontWeight: 800, color: '#991B1B' }}>
                    Certificate Revoked &bull; Invalid
                  </div>
                  <div style={{ fontSize: '12px', color: '#B91C1C', marginTop: '2px' }}>
                    This credential was cancelled and is no longer recognized as valid.
                  </div>
                </div>
              </div>

              <div style={{ padding: '24px' }}>
                <div style={{ marginBottom: '14px' }}>
                  <strong>Certificate #:</strong>{' '}
                  <span style={{ fontFamily: 'monospace', fontWeight: 700 }}>{result.certificateNumber}</span>
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <strong>Student Name:</strong> {result.studentName}
                </div>
                <div style={{ marginBottom: '14px' }}>
                  <strong>Programme:</strong> {result.programmeName}
                </div>
                <div
                  style={{
                    backgroundColor: '#FFF1F2',
                    border: '1px solid #FECDD3',
                    padding: '12px 16px',
                    borderRadius: '6px',
                    fontSize: '12.5px',
                    color: '#9F1239',
                  }}
                >
                  <strong>Documented Revocation Reason:</strong>
                  <div style={{ marginTop: '4px' }}>{result.revocationReason || 'Administrative cancellation'}</div>
                </div>
              </div>
            </div>
          ) : (
            <div style={{ padding: '36px 24px', textAlign: 'center' }}>
              <div style={{ fontSize: '48px', marginBottom: '12px' }}>❌</div>
              <div style={{ fontSize: '18px', fontWeight: 800, color: '#DC2626', marginBottom: '8px' }}>
                Certificate Verification Failed
              </div>
              <div style={{ fontSize: '13px', color: '#475569', lineHeight: '1.5', marginBottom: '20px' }}>
                No official credential was found matching identifier{' '}
                <code style={{ backgroundColor: '#F1F5F9', padding: '2px 6px', borderRadius: '4px' }}>
                  {decoded}
                </code>{' '}
                in the Clasptek authoritative registry.
              </div>
              <div
                style={{
                  fontSize: '12px',
                  color: '#64748B',
                  backgroundColor: '#F8FAFC',
                  border: '1px solid #E2E8F0',
                  padding: '12px',
                  borderRadius: '6px',
                  textAlign: 'left',
                }}
              >
                Please verify that you have entered the exact Certificate Number (e.g. <code>CERT-2026-1001</code>) or
                scanned an authentic QR code from an officially issued Clasptek diploma.
              </div>
            </div>
          )}

          {/* Footer note */}
          <div
            style={{
              padding: '14px 24px',
              backgroundColor: '#F8FAFC',
              borderTop: '1px solid #E2E8F0',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              fontSize: '11px',
              color: '#94A3B8',
            }}
          >
            <span>Clasptek Academic Registry System</span>
            <Link href="/login" style={{ color: '#080B78', textDecoration: 'none', fontWeight: 600 }}>
              Staff Portal &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
