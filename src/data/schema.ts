/**
 * The shape of an Airtable people export: one row per person, students and
 * mentors together, distinguished by the Role column.
 */

export const COLUMN = {
  name: 'Full Name',
  role: 'Role',
  email: 'Email',
  id: 'Person ID',
  /** On a student's row: the mentors they are currently matched with. */
  linkedMentors: 'Matched Alumni',
  /** On a mentor's row: the students they are currently matched with. */
  linkedStudents: 'Matched Student',
} as const;

export const REQUIRED_COLUMNS = [COLUMN.name, COLUMN.role, COLUMN.id] as const;

export type Role = 'student' | 'mentor';

export const ROLE_LABEL: Record<Role, string> = {
  student: 'Current Student',
  mentor: 'Alumni Mentor',
};

/** Questions only students answer. */
export const STUDENT_TEXT_FIELDS = [
  'Career/Goals Statement',
  'What You Seek in a Mentor',
  'Activities/Clubs',
] as const;

/** Questions only mentors answer. */
export const MENTOR_TEXT_FIELDS = ['Job Title and Employer', 'Why Mentor Statement'] as const;

/** Answered by everyone. */
export const SHARED_FIELDS = ['Majors', 'Minors'] as const;

/** Airtable record ids: "rec" followed by 14 letters and digits. */
export const RECORD_ID_PATTERN = /rec[A-Za-z0-9]{14}/g;

export interface Person {
  id: string;
  role: Role;
  name: string;
  email: string;
  /** Every column from the export, whitespace-trimmed. */
  fields: Record<string, string>;
  /** Record ids listed in this person's own Matched column. */
  linkedIds: string[];
  /** Spreadsheet row number as a person would see it (header is row 1). */
  row: number;
}
