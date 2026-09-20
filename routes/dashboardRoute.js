import express from "express";
import ExamRecord from "../models/examRecordSchema.js";

const dashboardRouter = express.Router();

const TERM_ORDER = ExamRecord.schema.path("term").enumValues;

function singleQueryValue(value) {
    return typeof value === "string" ? value.trim() : "";
}

function sortSchoolYears(values) {
    return values.sort((left, right) => {
        const leftStart = Number.parseInt(left.split("-")[0], 10);
        const rightStart = Number.parseInt(right.split("-")[0], 10);
        return rightStart - leftStart || right.localeCompare(left);
    });
}

dashboardRouter.get("/", async (req, res) => {
    try {
        // ── Build optional filter ──
        const termFilter = singleQueryValue(req.query.term);
        const schoolYearFilter = singleQueryValue(req.query.schoolYear);

        const query = {};
        if (termFilter && TERM_ORDER.includes(termFilter)) query.term = termFilter;
        if (schoolYearFilter) query.schoolYear = schoolYearFilter;

        // ── Fetch filter-option lists (always unfiltered) ──
        const [availableTerms, availableSchoolYears] = await Promise.all([
            ExamRecord.distinct("term"),
            ExamRecord.distinct("schoolYear")
        ]);

        const terms = TERM_ORDER.filter((t) => availableTerms.includes(t));
        const schoolYears = sortSchoolYears(availableSchoolYears);

        // ── Aggregate stats ──
        const examRecords = await ExamRecord.find(query)
            .populate({ path: "course", select: "courseCode courseName" })
            .populate({ path: "roster.student", select: "program" })
            .lean();

        // Global counters
        let totalStudents = 0;
        let totalPassed = 0;
        let totalCompletion = 0;

        // Per-course map:  courseCode → { courseName, students, passed, completion, passRate }
        const courseMap = new Map();
        // Per-program map: program → { students, passed, completion, passRate }
        const programMap = new Map();

        for (const record of examRecords) {
            if (!record.course) continue;
            const code = record.course.courseCode;

            if (!courseMap.has(code)) {
                courseMap.set(code, {
                    courseCode: code,
                    courseName: record.course.courseName,
                    students: 0,
                    passed: 0,
                    completion: 0
                });
            }

            const courseBucket = courseMap.get(code);

            for (const entry of record.roster) {
                totalStudents++;
                courseBucket.students++;

                const program = entry.student?.program || "Unknown";
                if (!programMap.has(program)) {
                    programMap.set(program, { program, students: 0, passed: 0, completion: 0 });
                }
                const programBucket = programMap.get(program);
                programBucket.students++;

                if (entry.status === "P" || entry.status === "Passed") {
                    totalPassed++;
                    courseBucket.passed++;
                    programBucket.passed++;
                } else {
                    totalCompletion++;
                    courseBucket.completion++;
                    programBucket.completion++;
                }
            }
        }

        const courseRows = [...courseMap.values()]
            .map(c => ({ ...c, passRate: c.students > 0 ? (c.passed / c.students * 100).toFixed(1) : 0 }))
            .sort((a, b) => a.courseCode.localeCompare(b.courseCode));
            
        const programRows = [...programMap.values()]
            .map(p => ({ ...p, passRate: p.students > 0 ? (p.passed / p.students * 100).toFixed(1) : 0 }))
            .sort((a, b) => a.program.localeCompare(b.program));

        res.render("dashboard", {
            totalStudents,
            totalPassed,
            totalCompletion,
            courseRows,
            programRows,
            terms,
            schoolYears,
            filters: { term: termFilter, schoolYear: schoolYearFilter }
        });
    } catch (error) {
        console.error("Unable to load dashboard:", error);
        res.status(500).send("Unable to load dashboard right now.");
    }
});

export default dashboardRouter;