/**
 * People -> a roster ready for matching: who is already matched, who still
 * needs a mentor, each mentor's current caseload, and anything in the data the
 * person running the match should know about.
 *
 * Issues describe the file, not the run, so they are computed over everyone and
 * don't change as people are excluded; the interface marks excluded people.
 */

import {
  MENTOR_TEXT_FIELDS,
  ROLE_LABEL,
  STUDENT_TEXT_FIELDS,
  type Person,
} from './schema';
import { bySeverity, type Issue } from './issues';

export interface Roster {
  /** Everyone usable from the file, including excluded people. */
  people: Person[];
  byId: Map<string, Person>;
  /** Current relationships, student id -> mentor ids. Ids may refer to people outside this file. */
  mentorsOfStudent: Map<string, string[]>;
  /** Current relationships, mentor id -> student ids. */
  studentsOfMentor: Map<string, string[]>;
  /** Mentors available for new matches this run (excluded mentors removed). */
  mentors: Person[];
  /** Existing caseload for each entry in `mentors`, same order. */
  existingLoad: number[];
  /** Students with no current mentor, excluded students removed. */
  studentsToMatch: Person[];
  /** Students who already have a mentor and are left alone. */
  alreadyMatchedStudents: Person[];
  excluded: ReadonlySet<string>;
  issues: Issue[];
}

export function buildRoster(
  people: Person[],
  parseIssues: Issue[] = [],
  excluded: ReadonlySet<string> = new Set(),
): Roster {
  const byId = new Map(people.map((p) => [p.id, p]));
  const issues: Issue[] = [...parseIssues];

  const { mentorsOfStudent, studentsOfMentor } = resolveRelationships(people, byId, issues);

  const students = people.filter((p) => p.role === 'student');
  const allMentors = people.filter((p) => p.role === 'mentor');
  const isMatched = (s: Person) => (mentorsOfStudent.get(s.id)?.length ?? 0) > 0;

  const alreadyMatchedStudents = students.filter(isMatched);
  const unmatchedStudents = students.filter((s) => !isMatched(s));

  flagDuplicateEmails(people, issues);
  flagMissingAnswers(allMentors, 'mentor', issues);
  flagMissingAnswers(unmatchedStudents, 'student', issues);

  const mentors = allMentors.filter((m) => !excluded.has(m.id));
  const studentsToMatch = unmatchedStudents.filter((s) => !excluded.has(s.id));

  if (allMentors.length === 0) {
    issues.push({
      kind: 'no-mentors',
      severity: 'error',
      message: `There are no ${ROLE_LABEL.mentor}s in this file, so there's no one to match students with.`,
      personIds: [],
    });
  }
  if (students.length > 0 && unmatchedStudents.length === 0) {
    issues.push({
      kind: 'no-students',
      severity: 'error',
      message: 'Every student in this file already has a mentor, so there is no one left to match.',
      personIds: [],
    });
  } else if (students.length === 0) {
    issues.push({
      kind: 'no-students',
      severity: 'error',
      message: `There are no ${ROLE_LABEL.student}s in this file.`,
      personIds: [],
    });
  }

  return {
    people,
    byId,
    mentorsOfStudent,
    studentsOfMentor,
    mentors,
    existingLoad: mentors.map((m) => studentsOfMentor.get(m.id)?.length ?? 0),
    studentsToMatch,
    alreadyMatchedStudents,
    excluded,
    issues: issues.sort(bySeverity),
  };
}

/**
 * A relationship exists if either side lists it. Airtable links are normally
 * two-way, but a partial export or a hand-edited file can break that, and a
 * student who is matched in Airtable must not be matched a second time here.
 */
function resolveRelationships(people: Person[], byId: Map<string, Person>, issues: Issue[]) {
  const mentorsOfStudent = new Map<string, Set<string>>();
  const studentsOfMentor = new Map<string, Set<string>>();
  const link = (studentId: string, mentorId: string) => {
    if (!mentorsOfStudent.has(studentId)) mentorsOfStudent.set(studentId, new Set());
    if (!studentsOfMentor.has(mentorId)) studentsOfMentor.set(mentorId, new Set());
    mentorsOfStudent.get(studentId)!.add(mentorId);
    studentsOfMentor.get(mentorId)!.add(studentId);
  };

  const unresolved: Person[] = [];
  const sameRole: Person[] = [];
  const oneSided: Person[] = [];

  for (const person of people) {
    for (const otherId of person.linkedIds) {
      const other = byId.get(otherId);

      if (!other) {
        // Still a real relationship in Airtable; count it so nobody is double-matched.
        if (person.role === 'student') link(person.id, otherId);
        else link(otherId, person.id);
        unresolved.push(person);
        continue;
      }
      if (other.role === person.role) {
        sameRole.push(person);
        continue;
      }

      const [student, mentor] = person.role === 'student' ? [person, other] : [other, person];
      link(student.id, mentor.id);
      if (!other.linkedIds.includes(person.id)) oneSided.push(person);
    }
  }

  if (unresolved.length > 0) {
    const who = unique(unresolved);
    issues.push({
      kind: 'unresolved-link',
      severity: 'warning',
      message:
        `${nameList(who)} ${who.length === 1 ? 'is' : 'are'} matched with someone who isn't in this file. ` +
        'Those matches still count: the students won’t be matched again, and the mentors’ caseloads include them. ' +
        'If this is unexpected, the export may be missing people.',
      personIds: who.map((p) => p.id),
    });
  }
  if (sameRole.length > 0) {
    const who = unique(sameRole);
    issues.push({
      kind: 'same-role-link',
      severity: 'warning',
      message:
        `${nameList(who)} ${who.length === 1 ? 'is' : 'are'} linked to someone with the same role ` +
        '(a student to a student, or a mentor to a mentor). Those links are ignored.',
      personIds: who.map((p) => p.id),
    });
  }
  if (oneSided.length > 0) {
    const who = unique(oneSided);
    issues.push({
      kind: 'one-sided-link',
      severity: 'info',
      message:
        `${plural(who.length, 'match is', 'matches are')} only recorded on one person’s row ` +
        `(${nameList(who)}). They’ve been counted as current matches.`,
      personIds: who.map((p) => p.id),
    });
  }

  const freeze = (m: Map<string, Set<string>>) => new Map([...m].map(([k, v]) => [k, [...v]]));
  return { mentorsOfStudent: freeze(mentorsOfStudent), studentsOfMentor: freeze(studentsOfMentor) };
}

function flagDuplicateEmails(people: Person[], issues: Issue[]) {
  const groups = new Map<string, Person[]>();
  for (const p of people) {
    const key = p.email.toLowerCase();
    if (!key) continue;
    groups.set(key, [...(groups.get(key) ?? []), p]);
  }
  for (const group of groups.values()) {
    if (group.length < 2) continue;
    const sameName = new Set(group.map((p) => p.name.toLowerCase())).size === 1;
    const rows = group.map((p) => p.row);
    issues.push({
      kind: 'duplicate-email',
      severity: 'warning',
      message: sameName
        ? `${group[0].name} appears ${group.length} times with the same email address (rows ${joinWords(rows.map(String))}). ` +
          'Unless you leave the extra records out, they’ll be treated as different people.'
        : `${joinWords(group.map((p) => `${p.name} (row ${p.row})`))} share an email address. ` +
          'Unless you leave one out, they’ll be treated as different people.',
      personIds: group.map((p) => p.id),
    });
  }
}

/**
 * Someone with nothing in their own role's questions gives the matcher nothing
 * to compare. The common cause is filling in the other role's questions, which
 * gets its own, more specific message since the fix is obvious.
 */
function flagMissingAnswers(people: Person[], role: 'student' | 'mentor', issues: Issue[]) {
  const own: readonly string[] = role === 'student' ? STUDENT_TEXT_FIELDS : MENTOR_TEXT_FIELDS;
  const other: readonly string[] = role === 'student' ? MENTOR_TEXT_FIELDS : STUDENT_TEXT_FIELDS;
  const hasText = (p: Person, fields: readonly string[]) => fields.some((f) => p.fields[f]);

  const blank: Person[] = [];
  for (const person of people) {
    if (hasText(person, own)) continue;
    const answeredInstead = other.filter((f) => person.fields[f]);
    if (answeredInstead.length > 0) {
      const otherRole = role === 'student' ? 'mentor' : 'student';
      issues.push({
        kind: 'answered-other-role',
        severity: 'warning',
        message:
          `${person.name} is listed as ${article(ROLE_LABEL[role])} but answered the ${otherRole} questions instead ` +
          `(${joinWords(answeredInstead.map((f) => `“${f}”`))}). With the ${role} questions blank, ` +
          'the matcher has very little to go on for them. You may want to correct their record in Airtable, or leave them out of this run.',
        personIds: [person.id],
      });
    } else {
      blank.push(person);
    }
  }

  if (blank.length > 0) {
    const noun = role === 'student' ? 'student' : 'mentor';
    issues.push({
      kind: 'no-profile-text',
      severity: 'warning',
      message:
        `${plural(blank.length, `${noun} hasn’t`, `${noun}s haven’t`)} answered any of the ${noun} questions ` +
        `(${nameList(blank)}), so the matcher has very little to go on for them.`,
      personIds: blank.map((p) => p.id),
    });
  }
}

const unique = (people: Person[]) => [...new Map(people.map((p) => [p.id, p])).values()];

function nameList(people: Person[], max = 4) {
  const names = people.map((p) => p.name);
  if (names.length <= max) return joinWords(names);
  return `${names.slice(0, max).join(', ')} and ${names.length - max} others`;
}

function joinWords(words: string[]) {
  if (words.length <= 1) return words.join('');
  if (words.length === 2) return `${words[0]} and ${words[1]}`;
  return `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`;
}

function plural(n: number, one: string, many: string) {
  return `${n} ${n === 1 ? one : many}`;
}

const article = (noun: string) => (/^[aeiou]/i.test(noun) ? `an ${noun}` : `a ${noun}`);
