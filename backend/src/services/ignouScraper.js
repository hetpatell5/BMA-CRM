/**
 * ignouScraper.js
 * Fetches Assignment/Practical/Project Marks Submission Status from IGNOU public portal.
 * No captcha, no login, no session required.
 * Direct URL: https://isms.ignou.ac.in/changeadmdata/StatusAssignment.asp?submit=1&enrno={ENR}&program={PROG}
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const IGNOU_ASSIGNMENT_URL = 'https://isms.ignou.ac.in/changeadmdata/StatusAssignment.asp';
const HTTP_TIMEOUT_MS = 20_000;

const AXIOS_HEADERS = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'en-US,en;q=0.5',
    'Connection': 'keep-alive',
};

/** Normalise programme code to match IGNOU URL param: "MCA NEW" -> "MCA_NEW" */
function normaliseProgramme(raw) {
    if (!raw) return '';
    return String(raw).trim().replace(/\s+/g, '_').toUpperCase();
}

/**
 * Parse the HTML table from IGNOU assignment status page.
 * Returns array of { type, course, session, status, date, isPending }
 */
function parseAssignmentTable(html) {
    const $ = cheerio.load(html);
    const rows = [];
    let targetTable = null;

    // Find table with header columns: Name/Type, Course, Session, Status, Date
    $('table').each((_, table) => {
        const headerCells = [];
        $(table).find('tr').first().find('th, td').each((_, el) => {
            headerCells.push($(el).text().trim().toLowerCase());
        });
        const hasRequired =
            (headerCells.some(h => h === 'name' || h === 'type')) &&
            headerCells.some(h => h === 'course') &&
            headerCells.some(h => h === 'session') &&
            headerCells.some(h => h.includes('status')) &&
            headerCells.some(h => h === 'date');
        if (hasRequired) { targetTable = table; return false; }
    });

    // Fallback: look for table containing Assignment/Practical/Project rows
    if (!targetTable) {
        $('table').each((_, table) => {
            const firstDataRow = $(table).find('tr').eq(1);
            const firstCell = firstDataRow.find('td').first().text().trim();
            if (['Assignment', 'Practical', 'Project'].includes(firstCell)) {
                targetTable = table; return false;
            }
        });
    }

    if (!targetTable) return rows;

    $(targetTable).find('tr').each((rowIdx, row) => {
        if (rowIdx === 0) return; // skip header
        const cells = [];
        $(row).find('td').each((_, el) => cells.push($(el).text().trim()));
        if (cells.length < 4) return;
        const [type, course, session, status, date = ''] = cells;
        if (!type || !course) return;
        const isPending = !date || date.trim() === '';
        rows.push({ type: type.trim(), course: course.trim(), session: session.trim(), status: status.trim(), date: date.trim(), isPending });
    });

    return rows;
}

/**
 * Fetch and parse assignment status for one student.
 */
async function checkStudent(enrollmentNo, programme) {
    const prog = normaliseProgramme(programme);
    const url = `${IGNOU_ASSIGNMENT_URL}?submit=1&enrno=${encodeURIComponent(enrollmentNo)}&program=${encodeURIComponent(prog)}`;
    const response = await axios.get(url, { timeout: HTTP_TIMEOUT_MS, headers: AXIOS_HEADERS, maxRedirects: 3 });
    const assignmentRows = parseAssignmentTable(response.data);
    const submittedCount = assignmentRows.filter(r => !r.isPending).length;
    const pendingCount   = assignmentRows.filter(r => r.isPending).length;
    const pendingCourses = assignmentRows.filter(r => r.isPending).map(r => `${r.type} ${r.course}`.trim()).join(', ');
    return { assignmentRows, totalItems: assignmentRows.length, submittedCount, pendingCount, pendingCourses };
}

export { checkStudent, normaliseProgramme };
