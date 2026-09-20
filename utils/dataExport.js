import XLSX from "xlsx";

/**
 * Build an XLSX workbook buffer from exam records.
 * @param {Array} examRecords - Populated exam records with course + roster.student
 * @param {Object} options - { title }
 * @returns {Buffer}
 */
export function buildExamReportXLSX(examRecords, options = {}) {
    const rows = [];

    for (const record of examRecords) {
        if (!record.course) continue;
        for (const entry of record.roster) {
            if (!entry.student) continue;
            const student = entry.student;
            const isPassed = entry.status === "P" || entry.status === "Passed";
            rows.push({
                "Course Code": record.course.courseCode,
                "Course Name": record.course.courseName,
                "Section": record.course.section,
                "Term": record.term,
                "School Year": record.schoolYear,
                "Student ID": student.studentId,
                "Last Name": student.surname,
                "First Name": student.firstName,
                "Middle Name": student.middleName || "",
                "Program": student.program,
                "Status": isPassed ? "Passed" : "Completion",
                "Recorded": entry.recorded ? "Yes" : "No"
            });
        }
    }

    const workbook = XLSX.utils.book_new();
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Auto-size columns
    const colWidths = Object.keys(rows[0] || {}).map((key) => ({
        wch: Math.max(key.length, ...rows.map((r) => String(r[key] || "").length)) + 2
    }));
    worksheet["!cols"] = colWidths;

    XLSX.utils.book_append_sheet(workbook, worksheet, options.title || "Exam Records");
    return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
}

/**
 * Build a simple text-based PDF buffer from exam records.
 * Uses a lightweight approach without pdfkit dependency.
 * Returns structured data that can be rendered by the client.
 * @param {Array} examRecords
 * @returns {Object} structured report data
 */
export function buildExamReportData(examRecords) {
    const courseGroups = new Map();

    for (const record of examRecords) {
        if (!record.course) continue;
        const key = `${record.course.courseCode} - ${record.term} ${record.schoolYear}`;

        if (!courseGroups.has(key)) {
            courseGroups.set(key, {
                courseCode: record.course.courseCode,
                courseName: record.course.courseName,
                section: record.course.section,
                term: record.term,
                schoolYear: record.schoolYear,
                students: [],
                passed: 0,
                completion: 0
            });
        }

        const group = courseGroups.get(key);
        for (const entry of record.roster) {
            if (!entry.student) continue;
            const isPassed = entry.status === "P" || entry.status === "Passed";

            group.students.push({
                studentId: entry.student.studentId,
                name: `${entry.student.surname}, ${entry.student.firstName}`,
                program: entry.student.program,
                status: isPassed ? "Passed" : "Completion",
                recorded: entry.recorded
            });

            if (isPassed) group.passed++;
            else group.completion++;
        }
    }

    return [...courseGroups.values()];
}
