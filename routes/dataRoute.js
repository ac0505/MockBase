import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import User from "../models/userSchema.js";
import ExamRecord from "../models/examRecordSchema.js";
import Course from "../models/courseSchema.js";
import Student from "../models/studentSchema.js";
import AuditLog from "../models/auditLogSchema.js";
import AcademicTerm from "../models/academicTermSchema.js";
import { parseStudentWorkbook, resolveStudentEntries, StudentImportConflictError } from "../utils/studentImport.js";
import { buildExamReportXLSX, buildExamReportData } from "../utils/dataExport.js";

const dataRouter = express.Router();
const AUTHORIZED_ROLES = new Set(User.schema.path("role").enumValues);
const TERM_ORDER = ExamRecord.schema.path("term").enumValues;
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

// ── Auth middleware ──
async function requireAuth(req, res, next) {
    try {
        const userId = req.session?.userId;
        if (!mongoose.isValidObjectId(userId)) {
            return req.path.startsWith("/api/")
                ? res.status(401).json({ error: "Session expired. Please sign in again." })
                : res.redirect("/login");
        }

        const user = await User.findById(userId).select("role isActive").lean();
        if (!user || !user.isActive || !AUTHORIZED_ROLES.has(user.role)) {
            return req.path.startsWith("/api/")
                ? res.status(403).json({ error: "You are not authorized." })
                : res.status(403).send("You are not authorized.");
        }

        req.authenticatedUser = user;
        return next();
    } catch (error) {
        return next(error);
    }
}

dataRouter.use(requireAuth);

// ── Render data page ──
dataRouter.get("/", (req, res) => {
    res.render("data", { userRole: req.session.role });
});

// ══════════════════════════════════════
//  UPLOAD / IMPORT
// ══════════════════════════════════════

// Parse and validate uploaded student file (preview before import)
dataRouter.post("/api/parse", (req, res, next) => {
    upload.single("file")(req, res, (error) => {
        if (error) {
            const message = error.code === "LIMIT_FILE_SIZE"
                ? "File must be 5 MB or smaller."
                : "Upload a CSV or Excel file.";
            return res.status(400).json({ error: message });
        }
        return next();
    });
}, async (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "Choose a file first." });
        const students = parseStudentWorkbook(req.file.buffer, req.file.originalname);
        const conflicts = [];
        const groups = new Map();
        students.forEach((student, index) => {
            if (!student.courseCode || !student.section) {
                conflicts.push(`Row ${index + 2}: Course Code and Section are required.`);
                return;
            }
            const key = `${student.courseCode.toUpperCase()}|${student.section.toUpperCase()}`;
            const group = groups.get(key) || { courseCode: student.courseCode.toUpperCase(), section: student.section.toUpperCase(), courseName: student.courseName || "", rows: [] };
            group.rows.push(student);
            if (!group.courseName && student.courseName) group.courseName = student.courseName;
            groups.set(key, group);
        });
        for (const group of groups.values()) {
            const ids = new Set();
            const names = new Map();
            group.rows.forEach((student, index) => {
                const id = student.studentId.trim().toLowerCase();
                const name = [student.firstName, student.middleName, student.surname].map((value) => String(value || "").trim().toLowerCase()).join("|");
                if (ids.has(id)) conflicts.push(`${group.courseCode}/${group.section}: duplicate Student ID ${student.studentId}.`);
                if (names.has(name) && names.get(name) !== id) conflicts.push(`${group.courseCode}/${group.section}: ${student.firstName} ${student.surname} has multiple Student IDs.`);
                ids.add(id);
                names.set(name, id);
            });
        }
        const existingCodes = [...groups.values()].map((group) => group.courseCode);
        const existingCourses = await Course.find({ courseCode: { $in: existingCodes } }).select("courseCode courseName section").lean();
        const existingByKey = new Map(existingCourses.map((course) => [`${course.courseCode}|${course.section}`, course]));
        const courseGroups = [...groups.values()].map(({ rows, ...group }) => ({ ...group, existingCourseName: existingByKey.get(`${group.courseCode}|${group.section}`)?.courseName || "" }));
        return res.json({ students, count: students.length, courseGroups, conflicts });
    } catch (error) {
        return res.status(400).json({ error: error.message || "Unable to read the file." });
    }
});

// Bulk import students to a specific exam record
dataRouter.post("/api/import", async (req, res) => {
    try {
        const { courseId, term, schoolYear, students, confirmExisting, courseNames = {} } = req.body || {};

        if (Array.isArray(students) && students.some((student) => student.courseCode && student.section)) {
            if (!TERM_ORDER.includes(term)) return res.status(400).json({ error: "A valid term must be selected." });
            if (typeof schoolYear !== "string" || !/^\d{4}-\d{4}$/.test(schoolYear)) return res.status(400).json({ error: "A valid school year must be selected." });
            const groups = new Map();
            for (const student of students) {
                const courseCode = String(student.courseCode || "").trim().toUpperCase();
                const section = String(student.section || "").trim().toUpperCase();
                if (!courseCode || !section) return res.status(400).json({ error: "Every imported row needs Course Code and Section." });
                const key = `${courseCode}|${section}`;
                const group = groups.get(key) || { courseCode, section, rows: [] };
                group.rows.push(student);
                groups.set(key, group);
            }
            const conflicts = [];
            const createdRecords = [];
            for (const group of groups.values()) {
                const ids = new Set();
                const names = new Map();
                group.rows.forEach((student) => {
                    const id = String(student.studentId).trim().toLowerCase();
                    const name = [student.firstName, student.middleName, student.surname].map((value) => String(value || "").trim().toLowerCase()).join("|");
                    if (ids.has(id)) conflicts.push(`${group.courseCode}/${group.section}: duplicate Student ID ${student.studentId}.`);
                    if (names.has(name) && names.get(name) !== id) conflicts.push(`${group.courseCode}/${group.section}: duplicate name with different Student ID.`);
                    ids.add(id);
                    names.set(name, id);
                });
                if (conflicts.length) continue;
                let course = await Course.findOne({ courseCode: group.courseCode, section: group.section });
                if (!course) {
                    const courseName = String(courseNames[group.courseCode] || "").trim();
                    if (!courseName) return res.status(422).json({ error: `Course name required for ${group.courseCode}.`, missingCourseNames: [group.courseCode] });
                    course = await Course.create({ courseCode: group.courseCode, courseName, section: group.section, proctor: req.authenticatedUser._id });
                }
                const resolvedIds = await resolveStudentEntries(group.rows, group.section, confirmExisting === true);
                let examRecord = await ExamRecord.findOne({ course: course._id, term, schoolYear });
                if (!examRecord) examRecord = new ExamRecord({ course: course._id, term, schoolYear, roster: [] });
                examRecord.roster.forEach((entry) => { if (!["P", "C", "Passed", "Completion"].includes(entry.status)) entry.status = "C"; });
                const existingIds = new Set(examRecord.roster.map((entry) => entry.student.toString()));
                resolvedIds.forEach((studentId) => {
                    if (!existingIds.has(studentId.toString())) examRecord.roster.push({ student: studentId });
                });
                await examRecord.save();
                createdRecords.push(examRecord._id);
            }
            if (conflicts.length) return res.status(422).json({ error: "Resolve the validation conflicts before importing.", conflicts });
            return res.status(201).json({ message: `Imported ${students.length} student rows.`, examRecordId: createdRecords[0], examRecordIds: createdRecords });
        }

        if (!mongoose.isValidObjectId(courseId)) {
            return res.status(400).json({ error: "A valid course must be selected." });
        }
        if (!TERM_ORDER.includes(term)) {
            return res.status(400).json({ error: "A valid term must be selected." });
        }
        if (typeof schoolYear !== "string" || !/^\d{4}-\d{4}$/.test(schoolYear)) {
            return res.status(400).json({ error: "School year must be in YYYY-YYYY format." });
        }
        if (!Array.isArray(students) || students.length === 0) {
            return res.status(400).json({ error: "At least one student is required." });
        }

        const course = await Course.findById(courseId).lean();
        if (!course) return res.status(404).json({ error: "Course not found." });

        const resolvedIds = await resolveStudentEntries(students, course.section, confirmExisting === true);

        let examRecord = await ExamRecord.findOne({ course: courseId, term, schoolYear });
        if (!examRecord) {
            examRecord = new ExamRecord({ course: courseId, term, schoolYear, roster: [] });
        }

        const existingIds = new Set(examRecord.roster.map((e) => e.student.toString()));
        let addedCount = 0;
        const skippedCount = 0;

        for (const studentId of resolvedIds) {
            const idStr = studentId.toString();
            if (existingIds.has(idStr)) continue;
            examRecord.roster.push({ student: studentId });
            existingIds.add(idStr);
            addedCount++;
        }

        if (addedCount === 0) {
            return res.status(409).json({ error: "All students are already in this exam roster." });
        }

        await examRecord.save();

        // Audit log
        try {
            await AuditLog.create({
                action: "BULK_IMPORT",
                targetType: "ExamRecord",
                targetId: examRecord._id,
                performedBy: req.authenticatedUser._id,
                details: `Imported ${addedCount} students to ${course.courseCode} (${term} ${schoolYear})`
            });
        } catch (logErr) {
            console.error("Audit log error:", logErr.message);
        }

        return res.status(201).json({
            message: `${addedCount} students imported successfully.`,
            examRecordId: examRecord._id,
            addedCount
        });
    } catch (error) {
        if (error instanceof StudentImportConflictError) {
            return res.status(409).json({
                error: "Some students already exist. Confirm to add them.",
                existingStudents: error.existingStudents,
                newStudents: error.newStudents,
                requiresConfirmation: true
            });
        }
        console.error("Import error:", error);
        return res.status(500).json({ error: error.message || "Unable to import students." });
    }
});

// ══════════════════════════════════════
//  DOWNLOAD / EXPORT
// ══════════════════════════════════════

// Export as XLSX
dataRouter.get("/api/export/xlsx", async (req, res) => {
    try {
        const query = {};
        if (req.query.term && TERM_ORDER.includes(req.query.term)) query.term = req.query.term;
        if (req.query.schoolYear) query.schoolYear = req.query.schoolYear;

        const examRecords = await ExamRecord.find(query)
            .populate({ path: "course", select: "courseCode courseName section" })
            .populate({ path: "roster.student", select: "studentId firstName middleName surname program" })
            .sort({ schoolYear: -1, term: 1 })
            .lean();

        const buffer = buildExamReportXLSX(examRecords, { title: "Exit Exam Report" });

        // Audit log
        try {
            await AuditLog.create({
                action: "EXPORT_DATA",
                targetType: "System",
                performedBy: req.authenticatedUser._id,
                details: `Exported XLSX report (${examRecords.length} records)`
            });
        } catch (logErr) {
            console.error("Audit log error:", logErr.message);
        }

        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="exit_exam_report_${Date.now()}.xlsx"`);
        return res.send(buffer);
    } catch (error) {
        console.error("Export XLSX error:", error);
        return res.status(500).json({ error: "Unable to export report." });
    }
});

// Export structured data for PDF (client-side PDF generation)
dataRouter.get("/api/export/report-data", async (req, res) => {
    try {
        const query = {};
        if (req.query.term && TERM_ORDER.includes(req.query.term)) query.term = req.query.term;
        if (req.query.schoolYear) query.schoolYear = req.query.schoolYear;

        const examRecords = await ExamRecord.find(query)
            .populate({ path: "course", select: "courseCode courseName section" })
            .populate({ path: "roster.student", select: "studentId firstName middleName surname program" })
            .sort({ schoolYear: -1, term: 1 })
            .lean();

        const reportData = buildExamReportData(examRecords);

        return res.json({ report: reportData });
    } catch (error) {
        console.error("Export data error:", error);
        return res.status(500).json({ error: "Unable to generate report data." });
    }
});

// Get available courses for the import form
dataRouter.get("/api/courses", async (req, res) => {
    try {
        const courses = await Course.find({})
            .select("courseCode courseName section")
            .sort({ courseCode: 1 })
            .lean();

        const examRecords = await ExamRecord.find({})
            .select("course term schoolYear")
            .lean();

        const recordsByCourse = new Map();
        for (const record of examRecords) {
            if (!record.course) continue;
            const key = record.course.toString();
            if (!recordsByCourse.has(key)) recordsByCourse.set(key, []);
            recordsByCourse.get(key).push({ term: record.term, schoolYear: record.schoolYear });
        }

        const academicTerms = await AcademicTerm.find({ isActive: true }).select("schoolYear term -_id").sort({ schoolYear: -1, term: 1 }).lean();
        return res.json({
            courses: courses.map((c) => ({
                _id: c._id,
                courseCode: c.courseCode,
                courseName: c.courseName,
                section: c.section,
                offerings: recordsByCourse.get(c._id.toString()) || []
            })),
            academicTerms
        });
    } catch (error) {
        console.error("Failed to fetch courses:", error);
        return res.status(500).json({ error: "Unable to fetch courses." });
    }
});

export default dataRouter;
