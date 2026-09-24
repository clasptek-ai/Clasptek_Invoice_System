/**
 * lib/finance/taxonomy.ts — Authoritative Accounting Taxonomy Constants
 * Phase 9C: Finance Completion & Financial Operations Migration
 *
 * Client-safe pure data constants (zero server dependencies).
 */

export const AUTHORITATIVE_EXPENSE_TAXONOMY: Record<string, string[]> = {
  'Personnel & Payroll': [
    'Salaries',
    'Wages',
    'Staff Allowances',
    'Bonuses',
    'Overtime',
    'Facilitator Fees',
    'Contractor Payments',
    'Staff Welfare',
    'Recruitment',
    'Training & Development'
  ],
  'Facilities & Utilities': [
    'Office Rent',
    'Electricity',
    'Water',
    'Internet',
    'Telephone',
    'Waste Management',
    'Cleaning',
    'Security',
    'Repairs & Maintenance',
    'Facility Supplies'
  ],
  'Technology & Software': [
    'Software Subscriptions',
    'Cloud Services',
    'Hosting',
    'Domain & SSL',
    'IT Equipment',
    'Computer Accessories',
    'Software Licences',
    'Technical Support',
    'Cybersecurity',
    'Data & Connectivity'
  ],
  'Academic & Training Operations': [
    'Training Materials',
    'Learning Resources',
    'Course Materials',
    'Practical Equipment',
    'Facilitator Resources',
    'Student Resources',
    'Certification Materials',
    'Academic Events',
    'Workshops',
    'Training Venue'
  ],
  'Marketing & Business Development': [
    'Advertising',
    'Social Media',
    'Digital Marketing',
    'Printing & Branding',
    'Promotional Materials',
    'Events & Campaigns',
    'Lead Generation',
    'Public Relations',
    'Website Marketing'
  ],
  'Administration & Office': [
    'Office Supplies',
    'Printing',
    'Stationery',
    'Postage & Courier',
    'Bank Charges',
    'Professional Services',
    'Legal Services',
    'Accounting Services',
    'Insurance',
    'Licences & Permits',
    'General Administration'
  ],
  'Travel & Logistics': [
    'Local Transport',
    'Fuel',
    'Vehicle Maintenance',
    'Accommodation',
    'Flights',
    'Meals & Travel Allowance',
    'Delivery & Logistics',
    'Parking & Tolls'
  ],
  'Finance & Banking': [
    'Bank Charges',
    'Payment Processing Fees',
    'Transaction Fees',
    'Interest & Finance Costs',
    'Foreign Exchange Charges'
  ],
  'Management & Corporate': [
    'Management Expenses',
    'Meetings',
    'Corporate Events',
    'Executive Travel',
    'Strategic Consulting',
    'Corporate Memberships'
  ],
  'Other / Miscellaneous': [
    'Miscellaneous Operating Expense',
    'Other Approved Expense'
  ]
};

export function getAuthoritativeExpenseGroups(): string[] {
  return Object.keys(AUTHORITATIVE_EXPENSE_TAXONOMY);
}

export function getAuthoritativeExpenseCategories(groupName: string): string[] {
  if (!groupName || typeof groupName !== 'string') return [];
  return AUTHORITATIVE_EXPENSE_TAXONOMY[groupName] ? [...AUTHORITATIVE_EXPENSE_TAXONOMY[groupName]] : [];
}

export function isValidExpenseClassification(group: string, category: string): boolean {
  if (!group || !category) return false;
  const cats = AUTHORITATIVE_EXPENSE_TAXONOMY[group];
  if (!cats || !Array.isArray(cats)) return false;
  return cats.includes(category);
}
