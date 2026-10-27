// English strings: short and plain, the same shape as ar.ts.
import type { Strings } from './ar';

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const minutes = (n: number) => plural(n, 'minute', 'minutes');

function duration(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (!h) return minutes(Math.max(1, m));
  return m ? `${plural(h, 'hour', 'hours')} ${m} min` : plural(h, 'hour', 'hours');
}

const and = (items: string[]) => (items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`);

export const en: Strings = {
  appName: 'Taleeb Portal',
  tagline: 'Your scattered university life, gathered into cards you read at a glance.',
  tabs: { home: 'Home', schedule: 'Schedule', space: 'My space', raad: 'Raad', courses: 'Courses', me: 'More' },

  welcome: {
    slides: [
      { title: 'Your door to your university data', body: 'Your schedule, absences, grades and exams, in clear cards. No more hunting through pages or asking about times.' },
      { title: 'Raad brings it to you', body: 'Raad is a server that signs in to your college system as you, reads your data, then leaves. He keeps none of it, and never writes a thing to the system.' },
      { title: 'And a space of your own', body: 'Your picture in the middle of the bar opens My space: your identity and standing, a kit for the links, notes, pictures and dates you reach for often, and your badges.' },
      { title: 'And your data stays with you', body: 'It is kept on your device, encrypted, with your kit and picture. Share any card as a picture if you like, with your personal details hidden.' },
    ],
    next: 'Next',
    skip: 'Skip',
    start: 'Start',
  },

  login: {
    userid: 'Student ID',
    password: 'Password',
    remember: 'Remember me on this device',
    submit: 'Sign in',
    demo: 'Try it with made-up data',
    errors: {
      CREDENTIALS: 'Wrong student ID or password.',
      LOCKED: 'Too many wrong attempts. Wait 15 minutes to protect your account.',
      ACCOUNT: 'The college system refuses your account itself, not the password: it may be locked or its password expired. Use the official system or ask the college.',
      COOLDOWN: 'The college system is struggling, so Raad rests a few minutes rather than add to it. Try again after.',
      PAUSED: 'Raad is paused right now. Come back later.',
      RATE_LIMIT: 'Too many requests. Wait a minute.',
      other: 'The college system is not responding. Try again shortly.',
    },
    consent: (terms, privacy) => [
      'I know this project is unofficial, and I agree to the ', terms, ' and the ', privacy, ' for improving and developing it.',
    ],
    terms: 'terms of use',
    privacy: 'privacy policy',
  },
  unofficial: 'An independent, unofficial student project, not affiliated with any official body.',

  institution: {
    pick: 'Choose your college',
    missing: 'My college is not listed',
    title: 'Ask for your college',
    hint: 'Name your college. Requests are counted, and the most asked-for colleges are built first.',
    name: 'College or university name',
    city: 'City',
    system: 'Its student system address',
    optional: 'optional',
    send: 'Send request',
    sent: 'Request received. The most asked-for colleges come first.',
    busy: 'Too many requests. Wait a minute.',
    failed: 'Could not send. Try again shortly.',
  },

  raad: {
    name: 'Raad',
    card: 'Raad’s identity',
    role: 'Data-fetching server',
    intro: 'Raad is a server that fetches your data from the college system: he signs in as you, reads what you are allowed to see, then leaves and keeps none of your data. He reads, never writes; he carries, never keeps.',
    home: 'Lives in',
    does: 'What he does',
    doesList: [
      'Signs in to the college system as you when you ask for a refresh, never otherwise.',
      'Reads what your account reads: schedule, grades, attendance and exams.',
      'When the system stumbles, he tries again, slowly, so as not to burden it.',
      'Hands what he read to your device, then signs out and ends the session.',
    ],
    never: 'What he never does',
    neverList: [
      'Keep your password or your data, or write them to any log.',
      'Write anything to the system or act for you: no enrolling, no dropping, no paying.',
      'Open a page your account is not allowed to see.',
    ],
    how: 'How he works',
    path: ['Your device', 'Raad', 'College system', 'Raad', 'Your device'],
    pathNotes: ['You ask for a refresh', 'Signs in as you', 'Reads your pages', 'Signs out', 'Extracts and encrypts'],
    status: { idle: 'Ready', working: 'Working', retrying: 'Retrying', needs: 'Needs you', offline: 'Offline', paused: 'Paused' },
    refresh: 'Refresh now',
    refreshAfter: (min: number) => `Next refresh in ${duration(min)}`,
    updatedLabel: 'Last refresh',
    log: 'His log',
    logEmpty: 'Nothing yet',
    needsYou: 'Enter your password again so Raad can work.',
    steps: {
      connect: 'Raad is on his way to the college system…',
      signin: 'Signing in as you…',
      fetch: areas => `Reading ${and(areas)}…`,
      signout: 'Signing out and ending the session…',
      extract: 'Extracting your data on your device…',
      merge: 'Comparing what is new with what was…',
      save: 'Encrypting your data and saving it on your device…',
      wait: sec => `The system stumbled; trying again in ${plural(sec, 'second', 'seconds')}…`,
      attempt: n => `Attempt ${n}…`,
      done: 'Done. Your data is in your hands.',
    },
    stepNames: {
      connect: 'Reaching Raad', signin: 'Signing in', fetch: 'Reading', signout: 'Signing out',
      extract: 'Extracting on your device', merge: 'Comparing', save: 'Encrypting and saving', wait: 'Waiting', attempt: 'New attempt',
    },
    jobState: {
      queued: 'Queued', running: 'Working', waiting_retry: 'Retrying', succeeded: 'Done', failed: 'Failed', needs_input: 'Needs you', cancelled: 'Interrupted',
    },
    failure: {
      CREDENTIALS: 'Password changed? Sign in again so Raad can work.',
      TRANSIENT: 'The college system is not responding.',
      SESSION: 'The college system keeps ending the session.',
      RATE_LIMIT: 'Too many requests. Wait a little.',
      UNEXPECTED: 'The system returned something we did not expect.',
      BLOCKED: 'The college firewall blocked Raad’s server, so he rests an hour.',
      ACCOUNT: 'The college system refuses your account itself; check the official system.',
      LOCKED: 'Too many wrong attempts, so Raad waits 15 minutes to protect your account.',
      COOLDOWN: 'The college system is struggling, so Raad rests a few minutes rather than add to it.',
      PAUSED: 'Raad is paused right now.',
      CANCELLED: 'Stopped before it finished.',
    },
    sync: 'Data refresh',
    attempts: (n, max) => `Attempt ${n} of ${max}`,
  },

  areas: {
    student: 'your details', schedule: 'the schedule', attendance: 'attendance', grades: 'grades',
    exams: 'exam times', notices: 'notices', extras: 'the rest',
  },

  components: { LEC: 'Lecture', LAB: 'Lab', TUT: 'Tutorial', SEM: 'Seminar', CLN: 'Clinical', PRA: 'Practical' },
  componentsThe: { LEC: 'lecture', LAB: 'lab', TUT: 'tutorial', SEM: 'seminar', CLN: 'clinical', PRA: 'practical' },

  card: { share: 'Share card', hide: 'Hide card' },

  home: {
    greeting: (hour, name) => `${hour < 12 ? 'Good morning' : 'Good evening'}${name ? `, ${name}` : ''}`,
    week: n => `Week ${n}`,
    updated: ago => `Updated ${ago}`,
    stale: 'Your data is old. Refresh it',
    neverUpdated: 'Not refreshed yet',
    demo: 'Demo with made-up data',
    exitDemo: 'Exit',
  },

  now: {
    title: 'Now and next',
    now: 'Now',
    next: 'Next',
    ends: min => `Ends in ${duration(min)}`,
    starts: min => `Starts in ${duration(min)}`,
    on: day => `On ${day}`,
    dayOver: 'Your day is over',
    freeDay: 'No classes today',
    nothing: 'No classes in the coming days',
    room: 'Room',
    noRoom: 'Room not set',
    clash: 'Clash',
    parts: { hours: 'Hours', minutes: 'Minutes', seconds: 'Seconds' },
  },

  today: { title: 'Today’s classes', empty: 'No classes today', all: 'Full schedule' },

  clashes: {
    title: 'A clash in your schedule',
    count: n => plural(n, 'clash', 'clashes'),
    exams: 'Two exams at once',
    hint: 'Two classes at the same time. Check your section in the official system.',
  },

  changes: {
    title: 'What’s new',
    empty: 'Nothing new since the last refresh',
    grade: (to, from) => (from ? `Grade changed: ${to}` : `Grade posted: ${to}`),
    absence: to => `Absence rose to ${to}%`,
    room: (compThe, room) => (room ? `New room for the ${compThe}: ${room}` : `The ${compThe} room changed`),
    time: compThe => `New time for the ${compThe}`,
    classAdded: compThe => `A ${compThe} section was added`,
    classRemoved: compThe => `The ${compThe} section was removed`,
    examAdded: date => `Exam announced: ${date}`,
    examChanged: date => `Exam moved: ${date}`,
    examRemoved: 'Exam date withdrawn',
    holdAdded: 'New hold',
    holdRemoved: 'Hold lifted',
    todoAdded: 'New to-do',
    todoRemoved: 'To-do done',
    gpaTitle: 'GPA',
    gpa: to => `Your GPA is now ${to}`,
    seen: 'Seen',
    newCount: n => `${n} new`,
    fresh: 'New',
  },

  alerts: {
    title: 'Needs your attention',
    hold: 'Hold',
    todo: 'To do',
    barred: 'Barred from the exam',
    risk: 'Absence near the limit',
    warn: 'Absence at half the limit',
    exam: d => (d === 0 ? 'Exam today' : d === 1 ? 'Exam tomorrow' : `Exam in ${d} days`),
    clash: 'Clash',
    none: 'Nothing to worry about now',
  },

  attendance: {
    title: 'Absence',
    limit: n => `Limit ${n}%`,
    left: b => {
      if (b.left === 0) return 'Estimate: at or near the limit';
      const hrs = b.hoursLeft > b.left
        ? ` (about ${b.hoursLeftAtMost && b.hoursLeftAtMost > b.hoursLeft ? `${b.hoursLeft} to ${b.hoursLeftAtMost}` : b.hoursLeft} hours)`
        : '';
      return b.leftAtMost && b.leftAtMost > 2
        ? `You can miss between ${b.left} and ${b.leftAtMost} more days of this course${hrs}; count on the lower`
        : `You can miss about ${plural(b.left, 'more day', 'more days')} of this course${hrs}`;
    },
    estimate: (total, allowed, endKnown) =>
      `About ${total} days of this course this term; the limit is ${allowed} of them.${endKnown ? '' : ' The term’s end is unknown, so the shortest likely term is counted.'} A day counts once, however many hours it has; the college system is the record.`,
    levels: { ok: 'Fine', warn: 'Careful', risk: 'Risk' },
    none: 'No absence recorded',
  },

  term: {
    title: 'Your term',
    week: (w, n, approx) => `Week ${w} of ${approx ? 'about ' : ''}${n}`,
    gpa: 'GPA',
    units: 'Credit hours',
    graded: 'Graded',
    courses: 'Courses',
    of: scale => `of ${scale}`,
  },

  exams: {
    title: 'Coming exams',
    empty: 'Exam times not announced yet',
    in: d => (d === 0 ? 'Today' : d === 1 ? 'Tomorrow' : `In ${d} days`),
    unit: d => (d === 0 ? 'today' : d === 1 ? 'day' : 'days'),
  },

  notice: { title: 'Announcement' },

  install: {
    title: 'Install the portal',
    body: 'Safari erases the data of sites that are not installed after a week away. Install it to keep your data.',
    steps: ['Tap the Share button', 'Then “Add to Home Screen”'],
    dismiss: 'Got it',
  },

  whatsNew: { title: v => `What’s new in ${v}`, dismiss: 'Seen' },

  schedule: {
    title: 'Schedule',
    views: { week: 'Week', day: 'Day', month: 'Month' },
    export: 'Add to your phone’s calendar',
    exportHint: 'A file your calendar imports: it reminds you 15 minutes before each class and a day before each exam. Export again when your schedule changes.',
    calendarName: 'My university schedule',
    exported: 'Calendar file exported. Open it to add your times to your calendar.',
    exam: 'Exam',
    empty: 'No classes',
  },

  courses: {
    title: 'Courses',
    count: 'Courses',
    units: 'Credit hours',
    graded: 'Graded',
    topAbsence: 'Top absence',
    notPosted: 'Not posted',
    unitsN: n => plural(n, 'credit hour', 'credit hours'),
  },

  course: {
    schedule: 'Times',
    absence: 'Absence',
    grade: 'Grade',
    exam: 'Exam',
    barred: 'Barred from the exam',
    section: 'Section',
    official: 'The official system is the record for all of the above.',
  },

  me: {
    title: 'More',
    card: 'Student card',
    id: 'Student ID',
    email: 'Email',
    phone: 'Mobile',
    advisor: 'Advisor',
    program: 'Program',
    notices: 'Holds and to-dos',
    more: 'Everything else',
    settings: 'Settings',
    about: 'About',
    feedback: 'Send feedback',
    feedbackCopied: 'Your app version and device type were copied. Paste them into your message.',
    signOut: 'Sign out',
    signOutConfirm: 'Signing out erases your data from this device, your kit and picture with it. Continue?',
  },

  space: {
    title: 'My space',
    tabs: { identity: 'Identity', grades: 'Standing', kit: 'Kit' },
    identity: 'Identity',
    status: 'Status',
    enrolled: 'Enrolled',
    noTerm: 'No current term',
    attendance: 'Attendance',
    attainment: 'Academic standing',
    unitsPassed: 'Hours passed',
    data: 'Details',
    college: 'College',
    photo: 'Change picture',
    photoReset: 'Back to the default picture',
    photoFailed: 'That picture could not be read.',
    grades: 'Academic standing',
    termGpa: 'Term GPA',
    previousGpa: 'Previous term',
    cumulativeGpa: 'Cumulative GPA',
    inProgress: 'in progress',
    term: 'Term',
    week: (w: number, n: number) => `Week ${w} of ${n}`,
    absence: 'Attendance and absence',
    near: 'Your highest absence is in',
    comma: ':',
    ofLimit: 'of a limit of',
    safe: 'Your absence is far from the limit in every course.',
    kit: 'Kit',
    kitHint: 'Shortcuts you reach for often, at hand: a link, a note, a picture or a countdown.',
    kinds: { link: 'Link', text: 'Note', image: 'Picture', countdown: 'Countdown' },
    add: 'Add',
    addTitle: 'Add to your kit',
    kind: 'Kind',
    name: 'Name',
    namePlaceholder: 'Academic calendar',
    value: { link: 'Link', text: 'Text', image: 'Picture', countdown: 'Ends at' },
    pickImage: 'Choose a picture',
    invalid: { link: 'That is not a valid link.', text: 'Write the text.', image: 'Choose a picture.', countdown: 'Choose when it ends.' },
    nameMissing: 'Give it a name.',
    full: 'Your kit is full: remove something to add another.',
    onDevice: 'On this device only',
    backup: 'Backup',
    backupTitle: 'Backup',
    backupHint: 'Your kit and picture are on this device only, and go when you sign out. Save a copy to carry them to another device. The file is not encrypted, so keep it somewhere safe.',
    save: 'Save a copy',
    restore: 'Restore from a copy',
    restored: (n: number) => `${plural(n, 'item', 'items')} restored.`,
    restoreFailed: 'That file is not a copy of your kit.',
    share: 'Share',
    remove: 'Remove',
    removeConfirm: 'Remove this from your kit?',
    open: 'Open',
    ends: 'Ends',
    ended: 'Ended',
    left: {
      days: (n: number) => (n === 1 ? 'day' : 'days'),
      hours: (n: number) => (n === 1 ? 'hour' : 'hours'),
      minutes: (n: number) => (n === 1 ? 'minute' : 'minutes'),
    },
    copied: 'Copied: paste it wherever you like.',
    badges: 'Badges',
    badge: {
      firstGrade: 'First grade posted',
      farFromLimit: 'Far from the limit',
      cleanCourse: 'A course with no absence',
      gpa35: 'GPA above 3.5',
      termDone: 'A term completed',
      units30: 'Thirty hours',
    },
    badgeHow: {
      firstGrade: 'Your first grade is posted.',
      farFromLimit: 'Your absence stays under half the limit in every course.',
      cleanCourse: 'You miss no class of a course this term.',
      gpa35: 'Your term GPA reaches 3.5.',
      termDone: 'A term closes with its grades.',
      units30: 'You pass thirty hours.',
    },
  },

  notices: { title: 'Holds and to-dos', none: 'No holds or to-dos' },
  more: { title: 'Everything else', hint: 'What Raad found on the system’s pages that has no place here yet.', none: 'Nothing' },

  settings: {
    title: 'Settings',
    language: 'Language',
    theme: 'Theme',
    themes: { auto: 'Auto', light: 'Day', dark: 'Night' },
    absenceLimit: 'Absence limit',
    metrics: 'Share anonymous Raad statistics',
    metricsHint: 'Only each refresh’s outcome and duration. No student ID, no address.',
    cards: 'Home cards',
    tour: 'Replay the welcome tour',
  },

  about: {
    title: 'About',
    what: 'Taleeb Portal is a general student information viewer: it reads from your institution’s system and shows it in clear cards.',
    readOnly: 'It only shows. It never enrolls or drops a course, pays a fee or files a request; all of that stays in the official system.',
    privacy: 'Your data is encrypted on your device. Your password travels encrypted to sign you in and is never kept on a server.',
    version: v => `Version ${v}`,
    official: 'Official system',
    contact: 'Contact channel',
    raad: 'About Raad',
  },

  share: {
    title: 'Share card',
    mask: 'Hide personal details',
    maskHint: 'Student ID, email, mobile and advisor',
    unofficial: 'Unofficial',
    share: 'Share',
    save: 'Save image',
    copy: 'Copy',
    copied: 'Image copied',
    preparing: 'Preparing the image…',
    failed: 'Could not prepare the image.',
    close: 'Close',
  },

  time: {
    ago: min => {
      if (min < 1) return 'just now';
      if (min < 60) return `${min} min ago`;
      const h = Math.round(min / 60);
      if (h < 24) return `${h} h ago`;
      return plural(Math.round(h / 24), 'day', 'days') + ' ago';
    },
    am: 'AM',
    pm: 'PM',
  },

  back: 'Back',
  close: 'Close',
  refresh: 'Refresh',
  empty: 'Nothing',
};
