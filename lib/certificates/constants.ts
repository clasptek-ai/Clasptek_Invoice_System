/**
 * lib/certificates/constants.ts — Phase 9D
 * Pure client-safe constants, templates, and formatting utilities.
 * Contains ZERO server-only imports. Safe for both Client and Server Components.
 */

import type { CertificateTemplate, ProgrammeCertificateSettings } from '@/types/certificates';

export const DEFAULT_ATTENDANCE_THRESHOLD = 80;

export const DEFAULT_CERTIFICATE_TEMPLATES: CertificateTemplate[] = [
  {
    id: 'tpl_clasptek_v1',
    name: 'Clasptek Classical Navy & Crimson (Standard)',
    version: '1.0',
    templateType: 'standard_completion',
    status: 'ACTIVE',
    isDefault: true,
    description:
      'A4 Landscape credential featuring double geometric navy frame, Clasptek official crest, embossed crimson rosette seal, and ISO QR code verification.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
  {
    id: 'tpl_clasptek_v2_modern',
    name: 'Clasptek Modern Slate & Gold (Executive)',
    version: '2.0',
    templateType: 'executive',
    status: 'DRAFT',
    isDefault: false,
    description: 'Executive landscape template for advanced corporate and postgraduate credentials.',
    createdAt: '2025-01-01T00:00:00Z',
    updatedAt: '2025-01-01T00:00:00Z',
  },
];

export function getDefaultCertificateSettingsForProgramme(
  progName?: string,
  progCode?: string
): ProgrammeCertificateSettings {
  const name = String(progName || '').toLowerCase();
  const code = String(progCode || '').toLowerCase();

  if (name.includes('data') || code.includes('da')) {
    return {
      certificateTitle: 'Certificate of Completion',
      certificateIntro: 'Has successfully gained the knowledge and practical skills with key focus in',
      certificateDescription: 'Data Analysis, Data Cleaning and Data Visualization',
      certificateRole: 'Data Analyst Professional',
      signatoryName: 'Academy Director',
      signatoryTitle: 'Academy Director Signature',
      certificateTemplateId: 'tpl_clasptek_v1',
      requiresAdminApproval: true,
      certificateEnabled: true,
    };
  }

  if (name.includes('cyber') || name.includes('security') || code.includes('cs') || code.includes('cyb')) {
    return {
      certificateTitle: 'Certificate of Completion',
      certificateIntro: 'Has successfully gained the knowledge and practical skills with core competencies in',
      certificateDescription: 'Threat Detection, Network Security, Risk Mitigation, and use of industry-standard tools.',
      certificateRole: 'CyberSecurity Professional',
      signatoryName: 'Academy Director',
      signatoryTitle: 'Academy Director Signature',
      certificateTemplateId: 'tpl_clasptek_v1',
      requiresAdminApproval: true,
      certificateEnabled: true,
    };
  }

  if (name.includes('web') || name.includes('software') || name.includes('full') || code.includes('web')) {
    return {
      certificateTitle: 'Certificate of Completion',
      certificateIntro: 'Has successfully gained the knowledge and practical skills with core competencies in',
      certificateDescription:
        'Full-Stack Web Application Architecture, Frontend & Backend Engineering, and Database Systems',
      certificateRole: 'Full-Stack Web Developer',
      signatoryName: 'Academy Director',
      signatoryTitle: 'Academy Director Signature',
      certificateTemplateId: 'tpl_clasptek_v1',
      requiresAdminApproval: true,
      certificateEnabled: true,
    };
  }

  if (name.includes('market') || code.includes('dim')) {
    return {
      certificateTitle: 'Certificate of Completion',
      certificateIntro: 'Has successfully gained the knowledge and practical skills with core competencies in',
      certificateDescription:
        'Digital Marketing Strategy, Performance Advertising, Search Optimization, and Customer Analytics',
      certificateRole: 'Digital Marketing Professional',
      signatoryName: 'Academy Director',
      signatoryTitle: 'Academy Director Signature',
      certificateTemplateId: 'tpl_clasptek_v1',
      requiresAdminApproval: true,
      certificateEnabled: true,
    };
  }

  return {
    certificateTitle: 'Certificate of Completion',
    certificateIntro: 'Has successfully gained the knowledge and practical skills with core competencies in',
    certificateDescription: 'Curriculum requirements, core vocational competencies, and professional practical training',
    certificateRole: progName ? `${progName} Professional` : 'Certified Professional',
    signatoryName: 'Academy Director',
    signatoryTitle: 'Academy Director Signature',
    certificateTemplateId: 'tpl_clasptek_v1',
    requiresAdminApproval: true,
    certificateEnabled: true,
  };
}

export function formatCertificateOrdinalDate(dateStr?: string | null): string {
  if (!dateStr || dateStr === 'N/A') return 'N/A';
  const months = [
    'JANUARY',
    'FEBRUARY',
    'MARCH',
    'APRIL',
    'MAY',
    'JUNE',
    'JULY',
    'AUGUST',
    'SEPTEMBER',
    'OCTOBER',
    'NOVEMBER',
    'DECEMBER',
  ];
  let d: Date;
  try {
    d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
  } catch {
    return dateStr;
  }
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const sfx =
    day === 1 || day === 21 || day === 31
      ? 'ST'
      : day === 2 || day === 22
      ? 'ND'
      : day === 3 || day === 23
      ? 'RD'
      : 'TH';
  return `${day}${sfx} ${month}, ${year}`;
}
