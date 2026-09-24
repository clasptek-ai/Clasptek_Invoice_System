'use client';

/**
 * components/certificates/CertificateDocument.tsx — Phase 9D
 * Production A4 Landscape Certificate Document Component
 *
 * Implements high-resolution vector SVG canvas matching CorelDRAW 2022
 * reference & clasptek_invoice_system.html with:
 * - A4 Landscape geometry (841.89 x 595.28 pt)
 * - Layered double geometric navy frame & red accent line (#ED1C24)
 * - Authentic 48-tooth red rosette seal badge
 * - Clasptek official academy crest logo & director signature
 * - Dynamic student profile name (never hardcoded)
 * - Programme-dependent competency statements & professional roles
 * - Pure vector QR code verification link
 * - Single-page print styling: @page { size: A4 landscape; margin: 0; }
 */

import React from 'react';
import type { Certificate } from '@/types/certificates';
import { formatCertificateOrdinalDate } from '@/lib/certificates/constants';
import { generateCertificateQrSvg } from '@/lib/certificates/qr-svg';

export interface CertificateDocumentProps {
  certificate: Certificate;
  className?: string;
  isPrintMode?: boolean;
}

export const CertificateDocument: React.FC<CertificateDocumentProps> = ({
  certificate,
  className = '',
  isPrintMode = false,
}) => {
  if (!certificate) return null;

  const studentName = certificate.studentNameSnapshot || 'Student Name';
  const progName = certificate.programmeNameSnapshot || 'Vocational Training Programme';
  const certNumber = certificate.certificateNumber || 'CERT-XXXX';
  const issueDate = certificate.issueDate || new Date().toISOString().slice(0, 10);
  const isRevoked = certificate.status === 'REVOKED';

  const certIntro =
    certificate.certificateIntroSnapshot ||
    'Has successfully gained the knowledge and practical skills with core competencies in';

  const certDescription =
    certificate.certificateDescriptionSnapshot ||
    (progName.toLowerCase().includes('cyber')
      ? 'Threat Detection, Network Security, Risk Mitigation, and use of industry-standard tools.'
      : progName.toLowerCase().includes('data')
      ? 'Data Analysis, Data Cleaning and Data Visualization'
      : `${progName} Core Vocational Competencies`);

  const certRole =
    certificate.certificateRoleSnapshot ||
    (progName.toLowerCase().includes('cyber')
      ? 'CyberSecurity Professional'
      : progName.toLowerCase().includes('data')
      ? 'Data Analyst Professional'
      : `${progName} Professional`);

  const signatoryTitle = certificate.signatoryTitle || 'Academy Director Signature';
  const displayDate = formatCertificateOrdinalDate(issueDate);

  // Verification URL
  const baseUrl = typeof window !== 'undefined' ? window.location.origin : 'https://portal.clasptek.com';
  const verificationUrl =
    certificate.verificationUrl ||
    `${baseUrl}/verify-certificate/${encodeURIComponent(certNumber)}`;

  // Vector QR SVG
  const qrSvgMarkup = generateCertificateQrSvg(verificationUrl, { cellSize: 1.1, margin: 0 });

  // Responsive font size for long names
  const nameLen = studentName.length;
  const nameFontSize = nameLen > 35 ? '16px' : nameLen > 28 ? '20px' : '24px';

  return (
    <div
      className={`certificate-print-page clasptek-cert-a4-landscape clasptek-cert-print-container clasptek-cert-frame ${className}`}
      data-credential-type="Certificate of Completion"
      data-programme-snapshot={progName}
      style={{
        boxSizing: 'border-box',
        width: '100%',
        maxWidth: isPrintMode ? '297mm' : '960px',
        margin: '0 auto',
        padding: 0,
        backgroundColor: '#DDDDF0',
        position: 'relative',
        overflow: 'hidden',
        boxShadow: isPrintMode ? 'none' : '0 16px 40px rgba(0,0,0,0.18)',
      }}
    >
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:ital,wght@0,400;0,500;0,600;0,700;1,400&family=Spicy+Rice&display=swap');
        @media print {
          @page {
            size: A4 landscape !important;
            margin: 0 !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: #DDDDF0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .clasptek-cert-print-container,
          .certificate-print-page {
            width: 297mm !important;
            max-width: 297mm !important;
            height: 210mm !important;
            box-shadow: none !important;
            margin: 0 !important;
            page-break-after: avoid !important;
            break-after: avoid !important;
          }
        }
      `}</style>

      {/* ===================== REVOKED WATERMARK ===================== */}
      {isRevoked && (
        <div
          style={{
            position: 'absolute',
            top: '40%',
            left: '6%',
            right: '6%',
            border: '8px solid #DC2626',
            color: '#DC2626',
            fontSize: '46px',
            fontWeight: 900,
            letterSpacing: '10px',
            padding: '14px 20px',
            transform: 'rotate(-14deg)',
            opacity: 0.9,
            pointerEvents: 'none',
            borderRadius: '10px',
            backgroundColor: 'rgba(255,255,255,0.93)',
            zIndex: 30,
            textAlign: 'center',
            fontFamily: 'Arial, sans-serif',
          }}
        >
          REVOKED &bull; INVALID
        </div>
      )}

      {/* ===================== PURE VECTOR SVG CANVAS ===================== */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 841.89 595.28"
        width="100%"
        height="100%"
        style={{ display: 'block', width: '100%', height: '100%', maxWidth: '100%' }}
      >
        <title>Certificate of Completion — {studentName}</title>

        {/* LAYER 1: Light Royal Blue Outer Background */}
        <rect width="841.89" height="595.28" fill="#DDDDF0" />

        {/* Vector Borders (converted from PDF coordinates) */}
        <g transform="matrix(1 0 0 -1 0 595.28)">
          {/* LAYER 2 & 3: Outer Thick Navy Ornamental Border (6pt stroke) with PURE WHITE Interior Fill */}
          <path
            d="M 56.9619 562.6485 L 784.8978 562.6485 C 784.8978 547.4534, 797.3306 535.0204, 812.5257 535.0204 L 812.5257 59.8510 C 797.3306 59.8510, 784.8978 47.4180, 784.8978 32.2228 L 56.9619 32.2228 C 56.9619 47.4180, 44.5292 59.8510, 29.3340 59.8510 L 29.3340 535.0204 C 44.5292 535.0204, 56.9619 547.4534, 56.9619 562.6485 Z"
            fill="#FFFFFF"
            stroke="#080B78"
            strokeWidth="6"
            strokeMiterlimit="10"
          />

          {/* Secondary Inner Navy Ornamental Border (3pt stroke) */}
          <path
            d="M 64.5134 554.5774 C 61.6286 541.2436, 51.0778 530.6927, 37.7439 527.8079 L 37.7439 67.0635 C 51.0778 64.1786, 61.6286 53.6278, 64.5134 40.2939 L 777.3463 40.2939 C 780.2311 53.6278, 790.7820 64.1786, 804.1158 67.0635 L 804.1158 527.8079 C 790.7820 530.6927, 780.2311 541.2436, 777.3463 554.5774 Z"
            fill="none"
            stroke="#080B78"
            strokeWidth="3"
            strokeMiterlimit="10"
          />

          {/* Fine Inner Navy/Slate Line (1pt stroke) */}
          <path
            d="M 72.2531 548.9935 C 69.4310 535.9490, 59.1094 525.6275, 46.0650 522.8053 L 46.0650 72.0660 C 59.1094 69.2439, 69.4310 58.9224, 72.2531 45.8779 L 769.6066 45.8779 C 772.4288 58.9224, 782.7503 69.2439, 795.7947 72.0660 L 795.7947 522.8053 C 782.7503 525.6275, 772.4288 535.9490, 769.6066 548.9935 Z"
            fill="none"
            stroke="#080B78"
            strokeWidth="1"
            strokeMiterlimit="10"
          />

          {/* LAYER 4: Thin Red Inner Accent Line (#ED1C24, uniform 1pt) */}
          <path
            d="M 78.2531 542.9935 L 763.6066 542.9935 C 766.4288 529.9490, 776.7503 519.6275, 789.7947 516.8053 L 789.7947 78.0660 C 776.7503 75.2439, 766.4288 64.9224, 763.6066 51.8779 L 78.2531 51.8779 C 75.4310 64.9224, 65.1094 75.2439, 52.0650 78.0660 L 52.0650 516.8053 C 65.1094 519.6275, 75.4310 529.9490, 78.2531 542.9935 Z"
            fill="none"
            stroke="#ED1C24"
            strokeWidth="1"
            strokeMiterlimit="10"
          />

          {/* Name Underline (Y=336.87pt) */}
          <path d="M 131.4505 258.4091 L 710.4090 258.4091" fill="none" stroke="#111111" strokeWidth="1" />

          {/* Academy Director Signature Line */}
          <path d="M 132.1642 115.28 L 325.5066 115.28" fill="none" stroke="#111111" strokeWidth="1" />

          {/* Date Line */}
          <path d="M 505.0 115.28 L 665.0 115.28" fill="none" stroke="#111111" strokeWidth="1" />

          {/* Authentic 48-Tooth Red Serrated Rosette Seal Badge (#ED1C24) */}
          <path
            className="rosette-seal-outer"
            d="M 420.9299 177.9809 L 424.2404 173.1790 L 428.1267 177.5282 L 430.8092 172.3493 L 435.2097 176.1769 L 437.2220 170.7026 L 442.0678 173.9486 L 443.3780 168.2654 L 448.5926 170.8784 L 449.1802 165.0756 L 454.6809 167.0148 L 454.5366 161.1839 L 460.2368 162.4181 L 459.3628 156.6516 L 465.1730 157.1615 L 463.5833 151.5501 L 469.4114 151.3278 L 467.1309 145.9599 L 472.8852 145.0089 L 469.9502 139.9691 L 475.5399 138.3046 L 471.9960 133.6720 L 477.3331 131.3201 L 473.2364 127.1684 L 478.2370 124.1660 L 473.6526 120.5606 L 478.2370 116.9552 L 473.2364 113.9528 L 477.3331 109.8011 L 471.9960 107.4492 L 475.5399 102.8169 L 469.9502 101.1523 L 472.8852 96.1123 L 467.1309 95.1613 L 469.4114 89.7934 L 463.5833 89.5711 L 465.1730 83.9597 L 459.3628 84.4699 L 460.2368 78.7031 L 454.5366 79.9373 L 454.6809 74.1067 L 449.1802 76.0456 L 448.5926 70.2428 L 443.3780 72.8561 L 442.0678 67.1726 L 437.2220 70.4188 L 435.2097 64.9443 L 430.8092 68.7722 L 428.1267 63.5930 L 424.2404 67.9422 L 420.9299 63.1403 L 417.6196 67.9422 L 413.7333 63.5930 L 411.0508 68.7722 L 406.6500 64.9443 L 404.6377 70.4188 L 399.7922 67.1726 L 398.4820 72.8561 L 393.2674 70.2428 L 392.6798 76.0456 L 387.1791 74.1067 L 387.3234 79.9373 L 381.6232 78.7031 L 382.4969 84.4699 L 376.6870 83.9597 L 378.2767 89.5711 L 372.4483 89.7934 L 374.7291 95.1613 L 368.9748 96.1123 L 371.9098 101.1523 L 366.3201 102.8169 L 369.8640 107.4492 L 364.5269 109.8011 L 368.6233 113.9528 L 363.6230 116.9552 L 368.2074 120.5606 L 363.6230 124.1660 L 368.6233 127.1684 L 364.5269 131.3201 L 369.8640 133.6720 L 366.3201 138.3046 L 371.9098 139.9691 L 368.9748 145.0089 L 374.7291 145.9599 L 372.4483 151.3278 L 378.2767 151.5501 L 376.6870 157.1615 L 382.4969 156.6516 L 381.6232 162.4181 L 387.3234 161.1839 L 387.1791 167.0148 L 392.6798 165.0756 L 393.2674 170.8784 L 398.4820 168.2654 L 399.7922 173.9486 L 404.6377 170.7026 L 406.6500 176.1769 L 411.0508 172.3493 L 413.7333 177.5282 L 417.6196 173.1790"
            fill="#ED1C24"
            stroke="none"
          />
        </g>

        {/* ===================== HEADER SECTION ===================== */}
        {/* Official Clasptek Academy Logo (Top-Left) */}
        <g className="academy-logo">
          <image
            href="/assets/clasptek-official-logo.png"
            x="72"
            y="68"
            width="150"
            height="42"
            preserveAspectRatio="xMinYMid meet"
          />
          <text
            x="72"
            y="94"
            fontFamily="'Montserrat','Avant Garde',sans-serif"
            fontWeight="900"
            fontSize="16"
            fill="#080B78"
            letterSpacing="2"
            style={{ display: 'none' }}
          >
            CLASPTEK
          </text>
        </g>

        {/* Certificate / Candidate No: (Top-Right, Arial regular) */}
        <text x="746" y="90" textAnchor="end" fontFamily="Arial, sans-serif" fontSize="9" fill="#111111">
          Certificate/Candidate No:{' '}
          <tspan fontFamily="'Courier New', monospace" fontWeight="bold">
            {certNumber}
          </tspan>
        </text>

        {/* ===================== TITLE SECTION ===================== */}
        {/* Display Title: Certificate (Spicy Rice, exactly centered at X=420.95, Y=210) */}
        <text
          x="420.95"
          y="210"
          textAnchor="middle"
          fontFamily="'Spicy Rice', cursive, serif"
          fontSize="64"
          fill="#080B78"
        >
          Certificate
        </text>

        {/* OF COMPLETION (Montserrat Demi, centered at Y=244) */}
        <text
          x="420.95"
          y="244"
          textAnchor="middle"
          fontFamily="'Montserrat', 'Avant Garde', 'Century Gothic', sans-serif"
          fontWeight="700"
          fontSize="16"
          letterSpacing="0.8"
          fill="#080B78"
        >
          OF COMPLETION
        </text>

        {/* ===================== CERTIFICATION STATEMENT ===================== */}
        {/* "This certifies that" (Centered at Y=282) */}
        <text
          x="420.95"
          y="282"
          textAnchor="middle"
          fontFamily="'Montserrat', 'Avant Garde', 'Century Gothic', sans-serif"
          fontWeight="700"
          fontSize="13.5"
          fill="#111111"
        >
          This certifies that
        </text>

        {/* Dynamic Student Name (Never Hardcoded, resting on the horizontal Name Line, baseline Y=328) */}
        <text
          x="420.95"
          y="328"
          textAnchor="middle"
          fontFamily="'Montserrat', 'Avant Garde', 'Century Gothic', sans-serif"
          fontWeight="700"
          fontSize={nameFontSize}
          letterSpacing="1.5"
          fill="#111111"
          style={{ textTransform: 'uppercase' }}
        >
          {studentName}
        </text>

        {/* Programme Statement Intro (Directly below Name Line, Y=366) */}
        <text
          x="420.95"
          y="366"
          textAnchor="middle"
          fontFamily="'Montserrat', 'Avant Garde', 'Century Gothic', sans-serif"
          fontSize="12"
          fill="#111111"
        >
          {certIntro}
        </text>

        {/* Programme Skill Focus / Competencies Description (Bold Demi, Y=388) */}
        <text
          x="420.95"
          y="388"
          textAnchor="middle"
          fontFamily="'Montserrat', 'Avant Garde', 'Century Gothic', sans-serif"
          fontWeight="700"
          fontSize="13"
          fill="#111111"
        >
          {certDescription}
        </text>

        {/* Professional Role (Regular + Bold Role, Y=410) */}
        <text
          x="420.95"
          y="410"
          textAnchor="middle"
          fontFamily="'Montserrat', 'Avant Garde', 'Century Gothic', sans-serif"
          fontSize="12"
          fill="#111111"
        >
          As a <tspan fontWeight="700">{certRole}</tspan>
        </text>

        {/* ===================== FOOTER SECTION ===================== */}
        {/* Academy Director Authorized Signature (Above signature line, Y=432-478) */}
        <image
          href="/assets/clasptek-certificate-signature.png"
          x="145"
          y="432"
          width="168"
          height="46"
          preserveAspectRatio="xMidYMid meet"
        />

        {/* Signatory Caption (Below signature line, Y=494) */}
        <text
          x="228.84"
          y="494"
          textAnchor="middle"
          fontFamily="'Montserrat', 'Avant Garde', 'Century Gothic', sans-serif"
          fontSize="10"
          fill="#111111"
        >
          {signatoryTitle}
        </text>

        {/* Date Value (Above date line, baseline Y=473, centered at X=585) */}
        <text
          x="585"
          y="473"
          textAnchor="middle"
          fontFamily="'Montserrat', 'Avant Garde', 'Century Gothic', sans-serif"
          fontWeight="700"
          fontSize="12"
          fill="#111111"
        >
          {displayDate}
        </text>

        {/* Date Caption (Below date line, Y=494) */}
        <text
          x="585"
          y="494"
          textAnchor="middle"
          fontFamily="'Montserrat', 'Avant Garde', 'Century Gothic', sans-serif"
          fontSize="10"
          fill="#111111"
        >
          Date
        </text>

        {/* SUBORDINATE QR VERIFICATION CODE (Bottom-Right) */}
        <g className="cert-qr-svg" transform="translate(686, 440)">
          <g dangerouslySetInnerHTML={{ __html: qrSvgMarkup }} />
          <text
            x="16"
            y="38"
            textAnchor="middle"
            fontFamily="'Montserrat', Arial, sans-serif"
            fontSize="5.5"
            fontWeight="700"
            fill="#080B78"
          >
            Scan to Verify
          </text>
          <text
            x="16"
            y="46"
            textAnchor="middle"
            fontFamily="'Montserrat', Arial, sans-serif"
            fontSize="4.5"
            fill="#4B5563"
          >
            Certificate
          </text>
        </g>
      </svg>
    </div>
  );
};
