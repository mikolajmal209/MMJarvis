/**
 * Jarvis Google bridge.
 *
 * Runs free inside your own Google account and gives the Jarvis app access to
 * Gmail and Google Calendar. It also scans your inbox every hour for job
 * application emails, keeps a "Jarvis job applications" spreadsheet up to date,
 * and puts interviews in your calendar with reminders.
 *
 * Setup: see apps-script/README.md.
 */

var JOB_STATUSES = ['sent', 'no_reply', 'replied', 'interview', 'offer', 'rejected'];
var STATUS_RANK = { sent: 0, no_reply: 1, replied: 2, interview: 3, offer: 4, rejected: 4 };
var NO_REPLY_DAYS = 14;
var MAX_EMAILS_PER_RUN = 20;
var JOB_HEADERS = ['id', 'company', 'role', 'status', 'sentAt', 'lastUpdate', 'interviewAt', 'note', 'calendarEventId'];

// Words that suggest an email is about a job application (English and Polish).
var JOB_QUERY =
  '(application OR applying OR applied OR interview OR candidate OR recruitment OR recruiter OR position OR "job offer" OR ' +
  'rekrutacja OR rekrutacji OR aplikacja OR aplikację OR rozmowa OR rozmowę OR kandydat OR kandydatura OR CV OR ' +
  '"oferta pracy" OR stanowisko) -category:promotions -category:social';

function props() {
  return PropertiesService.getScriptProperties();
}

/** Run once from the editor. Creates the token, the spreadsheet and the hourly scan. */
function setup() {
  var p = props();
  if (!p.getProperty('JARVIS_TOKEN')) {
    p.setProperty('JARVIS_TOKEN', Utilities.getUuid().replace(/-/g, ''));
  }
  jobsSheet_();
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'scanJobEmails') ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger('scanJobEmails').timeBased().everyHours(1).create();
  if (!p.getProperty('GEMINI_API_KEY')) {
    Logger.log('Add a script property GEMINI_API_KEY (Project Settings > Script properties) so the inbox scan can read emails.');
  }
  Logger.log('Secret token for the Jarvis app: ' + p.getProperty('JARVIS_TOKEN'));
  Logger.log('Spreadsheet: ' + SpreadsheetApp.openById(p.getProperty('JOBS_SHEET_ID')).getUrl());
}

// ---------------------------------------------------------------- web app

function doGet() {
  return ContentService.createTextOutput('Jarvis bridge is running.');
}

function doPost(e) {
  var out;
  try {
    var req = JSON.parse(e.postData.contents);
    var token = props().getProperty('JARVIS_TOKEN');
    if (!token || req.token !== token) throw new Error('Wrong token');
    out = { ok: true, result: handle_(req.action, req.params || {}) };
  } catch (err) {
    out = { ok: false, error: String(err && err.message ? err.message : err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function handle_(action, params) {
  switch (action) {
    case 'ping':
      return { email: Session.getEffectiveUser().getEmail() };
    case 'calendar.list':
      return listEvents_(params);
    case 'calendar.create':
      return createEvent_(params);
    case 'gmail.search':
      return searchEmail_(params);
    case 'jobs.list':
      return readJobs_().map(function (j) {
        return { id: j.id, company: j.company, role: j.role, status: j.status, sentAt: j.sentAt,
          lastUpdate: j.lastUpdate, interviewAt: j.interviewAt, note: j.note };
      });
    default:
      throw new Error('Unknown action: ' + action);
  }
}

// ---------------------------------------------------------------- calendar and gmail

function listEvents_(p) {
  var from = p.from ? new Date(p.from) : new Date();
  var to = p.to ? new Date(p.to) : endOfDay_(from);
  return CalendarApp.getDefaultCalendar().getEvents(from, to).map(function (ev) {
    return {
      id: ev.getId(),
      title: ev.getTitle(),
      start: ev.getStartTime().toISOString(),
      end: ev.getEndTime().toISOString(),
      allDay: ev.isAllDayEvent(),
      location: ev.getLocation() || undefined,
    };
  });
}

function createEvent_(p) {
  if (!p.title || !p.start) throw new Error('title and start are required');
  var start = new Date(p.start);
  var end = p.end ? new Date(p.end) : new Date(start.getTime() + 60 * 60 * 1000);
  var ev = CalendarApp.getDefaultCalendar().createEvent(p.title, start, end, { description: p.description || '' });
  if (p.remind_minutes_before) ev.addPopupReminder(Number(p.remind_minutes_before));
  return { id: ev.getId(), title: p.title, start: start.toISOString(), end: end.toISOString() };
}

function searchEmail_(p) {
  var max = Math.min(Number(p.max) || 10, 25);
  return GmailApp.search(String(p.query || ''), 0, max).map(function (thread) {
    var msgs = thread.getMessages();
    var m = msgs[msgs.length - 1];
    return {
      id: m.getId(),
      from: m.getFrom(),
      subject: m.getSubject(),
      date: m.getDate().toISOString(),
      snippet: m.getPlainBody().replace(/\s+/g, ' ').slice(0, 400),
    };
  });
}

function endOfDay_(d) {
  var e = new Date(d);
  e.setHours(23, 59, 59, 999);
  return e;
}

// ---------------------------------------------------------------- job application tracking

/** Runs every hour. Reads new job-related emails, updates the spreadsheet and the calendar. */
function scanJobEmails() {
  var p = props();
  var apiKey = p.getProperty('GEMINI_API_KEY');
  if (!apiKey) throw new Error('Set the GEMINI_API_KEY script property first.');
  var model = p.getProperty('GEMINI_MODEL') || 'gemini-flash-latest';
  var lastScan = Number(p.getProperty('LAST_SCAN') || 0);
  // First run looks back 30 days, later runs 2 days (overlap is fine: processed ids are skipped).
  var days = lastScan ? 2 : 30;
  var processed = JSON.parse(p.getProperty('PROCESSED_IDS') || '[]');
  var seen = {};
  processed.forEach(function (id) { seen[id] = true; });

  var threads = GmailApp.search('newer_than:' + days + 'd ' + JOB_QUERY, 0, 50);
  var handled = 0;
  for (var i = 0; i < threads.length && handled < MAX_EMAILS_PER_RUN; i++) {
    var msgs = threads[i].getMessages();
    for (var k = 0; k < msgs.length && handled < MAX_EMAILS_PER_RUN; k++) {
      var m = msgs[k];
      if (seen[m.getId()]) continue;
      seen[m.getId()] = true;
      processed.push(m.getId());
      handled++;
      try {
        var info = classifyEmail_(m, apiKey, model);
        if (info && info.is_job_application_email && info.company) applyEmail_(info, m.getDate());
      } catch (err) {
        Logger.log('Could not classify "' + m.getSubject() + '": ' + err);
      }
      Utilities.sleep(4000); // stay under the free tier's requests-per-minute limit
    }
  }
  markNoReply_();
  // Keep the processed list small enough for script properties.
  p.setProperty('PROCESSED_IDS', JSON.stringify(processed.slice(-400)));
  p.setProperty('LAST_SCAN', String(Date.now()));
}

function classifyEmail_(m, apiKey, model) {
  var me = Session.getEffectiveUser().getEmail();
  var sentByMe = m.getFrom().indexOf(me) !== -1;
  var text =
    'Direction: ' + (sentByMe ? 'sent BY the user' : 'received by the user') + '\n' +
    'From: ' + m.getFrom() + '\nTo: ' + m.getTo() + '\nDate: ' + m.getDate().toISOString() +
    '\nSubject: ' + m.getSubject() + '\nAttachments: ' +
    m.getAttachments().map(function (a) { return a.getName(); }).join(', ') +
    '\n\n' + m.getPlainBody().slice(0, 4000);

  var body = {
    systemInstruction: { parts: [{ text:
      'You read one email and decide whether it is about a job application of the user. ' +
      'event: "applied" when the user sent a CV/application or got an application confirmation; ' +
      '"replied" when an employer or recruiter answered with a question or next step that is not yet a scheduled interview; ' +
      '"interview" when an interview is scheduled or proposed (give interview_at as ISO 8601 local time if a time is stated); ' +
      '"offer" for a job offer; "rejected" for a rejection. Job alerts, newsletters and ads are NOT application emails. ' +
      'summary: one short English sentence for the user about what happened and any next step.' }] },
    contents: [{ role: 'user', parts: [{ text: text }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          is_job_application_email: { type: 'BOOLEAN' },
          company: { type: 'STRING' },
          role: { type: 'STRING' },
          event: { type: 'STRING', enum: ['applied', 'replied', 'interview', 'offer', 'rejected', 'other'] },
          interview_at: { type: 'STRING', nullable: true },
          summary: { type: 'STRING' },
        },
        required: ['is_job_application_email'],
      },
    },
  };
  var res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent',
    {
      method: 'post',
      contentType: 'application/json',
      headers: { 'x-goog-api-key': apiKey },
      payload: JSON.stringify(body),
      muteHttpExceptions: true,
    }
  );
  if (res.getResponseCode() !== 200) throw new Error('Gemini ' + res.getResponseCode() + ': ' + res.getContentText().slice(0, 300));
  var data = JSON.parse(res.getContentText());
  var part = data.candidates && data.candidates[0].content.parts[0];
  return part ? JSON.parse(part.text) : null;
}

function applyEmail_(info, emailDate) {
  var statusByEvent = { applied: 'sent', replied: 'replied', interview: 'interview', offer: 'offer', rejected: 'rejected' };
  var newStatus = statusByEvent[info.event];
  if (!newStatus) return;
  var day = Utilities.formatDate(emailDate, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var jobs = readJobs_();
  var job = findJob_(jobs, info.company, info.role);
  if (!job) {
    job = { id: Utilities.getUuid(), company: info.company, role: info.role || '', status: newStatus,
      sentAt: day, lastUpdate: day, interviewAt: '', note: info.summary || '', calendarEventId: '' };
    jobs.push(job);
  } else {
    // Move forward only, except that offers and rejections always count.
    if (STATUS_RANK[newStatus] >= STATUS_RANK[job.status] || newStatus === 'rejected' || newStatus === 'offer') {
      job.status = newStatus;
    }
    if (!job.role && info.role) job.role = info.role;
    if (day > (job.lastUpdate || '')) job.lastUpdate = day;
    if (info.summary) job.note = info.summary;
  }
  if (newStatus === 'interview' && info.interview_at) {
    var when = new Date(info.interview_at);
    if (!isNaN(when.getTime()) && when.getTime() > Date.now() && job.interviewAt !== info.interview_at) {
      job.interviewAt = info.interview_at;
      job.calendarEventId = scheduleInterview_(job, when);
    }
  }
  writeJobs_(jobs);
}

/** Puts the interview in Google Calendar with reminders the day before and an hour before. */
function scheduleInterview_(job, when) {
  var cal = CalendarApp.getDefaultCalendar();
  if (job.calendarEventId) {
    var old = cal.getEventById(job.calendarEventId);
    if (old) old.deleteEvent();
  }
  var ev = cal.createEvent('Interview: ' + job.company + (job.role ? ' (' + job.role + ')' : ''), when,
    new Date(when.getTime() + 60 * 60 * 1000), { description: 'Added by Jarvis. ' + (job.note || '') });
  ev.removeAllReminders();
  ev.addPopupReminder(24 * 60);
  ev.addPopupReminder(60);
  return ev.getId();
}

function markNoReply_() {
  var jobs = readJobs_();
  var cutoff = new Date(Date.now() - NO_REPLY_DAYS * 864e5);
  var changed = false;
  jobs.forEach(function (j) {
    if (j.status === 'sent' && j.lastUpdate && new Date(j.lastUpdate) < cutoff) {
      j.status = 'no_reply';
      j.note = 'No answer for ' + NO_REPLY_DAYS + '+ days. Consider a follow-up.';
      changed = true;
    }
  });
  if (changed) writeJobs_(jobs);
}

function normalize_(s) {
  return String(s || '').toLowerCase().replace(/\b(sp\. z o\.o\.|s\.a\.|inc|ltd|llc|gmbh|sa)\b/g, '').replace(/[^a-z0-9ąćęłńóśźż]+/g, ' ').trim();
}

function findJob_(jobs, company, role) {
  var c = normalize_(company);
  var r = normalize_(role);
  var sameCompany = jobs.filter(function (j) { return normalize_(j.company) === c; });
  if (!sameCompany.length) return null;
  if (r) {
    var exact = sameCompany.filter(function (j) { return normalize_(j.role) === r; })[0];
    if (exact) return exact;
    var noRole = sameCompany.filter(function (j) { return !j.role; })[0];
    if (noRole) return noRole;
    return sameCompany.length === 1 ? sameCompany[0] : null;
  }
  return sameCompany[0];
}

// ---------------------------------------------------------------- spreadsheet storage

function jobsSheet_() {
  var p = props();
  var id = p.getProperty('JOBS_SHEET_ID');
  var ss = null;
  if (id) {
    try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; }
  }
  if (!ss) {
    ss = SpreadsheetApp.create('Jarvis job applications');
    p.setProperty('JOBS_SHEET_ID', ss.getId());
    var sh = ss.getSheets()[0];
    sh.setName('Jobs');
    sh.getRange(1, 1, 1, JOB_HEADERS.length).setValues([JOB_HEADERS]).setFontWeight('bold');
    sh.setFrozenRows(1);
  }
  return ss.getSheetByName('Jobs');
}

function readJobs_() {
  var sh = jobsSheet_();
  var values = sh.getDataRange().getDisplayValues();
  return values.slice(1).filter(function (r) { return r[0]; }).map(function (r) {
    var j = {};
    JOB_HEADERS.forEach(function (h, i) { j[h] = r[i] || ''; });
    if (JOB_STATUSES.indexOf(j.status) === -1) j.status = 'sent';
    return j;
  });
}

function writeJobs_(jobs) {
  var sh = jobsSheet_();
  var rows = jobs.map(function (j) { return JOB_HEADERS.map(function (h) { return j[h] || ''; }); });
  sh.getRange(2, 1, Math.max(sh.getMaxRows() - 1, 1), JOB_HEADERS.length).clearContent();
  if (rows.length) {
    // Plain text format so dates are not converted by Sheets.
    sh.getRange(2, 1, rows.length, JOB_HEADERS.length).setNumberFormat('@').setValues(rows);
  }
}
