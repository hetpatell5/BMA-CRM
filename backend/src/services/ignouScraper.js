/**
 * ignouScraper.js
 * Fetches Assignment/Practical/Project Marks Submission Status from IGNOU public portal.
 * No captcha, no login, no session required.
 * Direct URL: https://isms.ignou.ac.in/changeadmdata/StatusAssignment.asp?submit=1&enrno={ENR}&program={PROG}
 */

import axios from 'axios';
import * as cheerio from 'cheerio';

const IGNOU_ASSIGNMENT_URL = 'https://isms.ignou.ac.in/changeadmdata/StatusAssignment.asp';
const IGNOU_GRADECARD_URL  = 'https://gradecard.ignou.ac.in/view_gradecard.aspx';
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

/**
 * Parse the HTML grade card table from gradecard.ignou.ac.in.
 * Table ID: ctl00_ContentPlaceHolder1_gvDetail
 * Columns: COURSE | Asgn1 | LAB1 | LAB2 | LAB3 | LAB4 | TERM END THEORY | TERM END PRACTICAL | STATUS
 */
function parseGradeCardTable(html) {
    const $ = cheerio.load(html);
    const rows = [];

    // Helper: strip &nbsp; (U+00A0) and regular whitespace
    const cleanText = (el) => $(el).text().replace(/\u00a0/g, '').trim();

    // Primary selector — known table ID from the ASP.NET page
    let table = $('#ctl00_ContentPlaceHolder1_gvDetail');

    // Fallback: find any table whose header contains "COURSE" and "STATUS"
    if (!table.length) {
        $('table').each((_, t) => {
            const headers = [];
            $(t).find('tr').first().find('th, td').each((_, el) => {
                headers.push(cleanText(el).toUpperCase());
            });
            if (headers.includes('COURSE') && headers.includes('STATUS')) {
                table = $(t);
                return false;
            }
        });
    }

    if (!table.length) return rows;

    table.find('tr').each((rowIdx, row) => {
        if (rowIdx === 0) return; // skip header row (th elements)
        const cells = [];
        $(row).find('td').each((_, el) => cells.push(cleanText(el)));
        if (cells.length < 2) return;

        const course = cells[0];
        // Skip footer rows: the last blue row has &nbsp; in every cell
        if (!course || course === '') return;

        const asgn1            = cells[1]  || '';
        const lab1             = cells[2]  || '';
        const lab2             = cells[3]  || '';
        const lab3             = cells[4]  || '';
        const lab4             = cells[5]  || '';
        const termEndTheory    = cells[6]  || '';
        const termEndPractical = cells[7]  || '';
        const status           = cells[cells.length - 1] || '';

        const isCompleted = status.trim().toUpperCase() === 'COMPLETED';
        rows.push({ course: course.trim(), asgn1, lab1, lab2, lab3, lab4, termEndTheory, termEndPractical, status: status.trim(), isCompleted });
    });

    return rows;
}

/**
 * Fetch and parse grade card for one student from gradecard.ignou.ac.in.
 * NOTE: programme code must NOT be URL-encoded (IGNOU rejects MCA%5FNEW; needs MCA_NEW).
 */
async function checkGradeCard(enrollmentNo, programme) {
    const prog = normaliseProgramme(programme);
    // Enrolment no is user input — encode it. Programme is alphanumeric+underscore — keep literal.
    const url  = `${IGNOU_GRADECARD_URL}?eno=${encodeURIComponent(enrollmentNo)}&prog=${prog}&type=1`;
    const response = await axios.get(url, { timeout: HTTP_TIMEOUT_MS, headers: AXIOS_HEADERS, maxRedirects: 3 });
    const gradeCardRows     = parseGradeCardTable(response.data);
    const completedCount    = gradeCardRows.filter(r => r.isCompleted).length;
    const notCompletedCount = gradeCardRows.filter(r => !r.isCompleted).length;
    return { gradeCardRows, totalCourses: gradeCardRows.length, completedCount, notCompletedCount };
}


export { checkStudent, checkGradeCard, normaliseProgramme };
