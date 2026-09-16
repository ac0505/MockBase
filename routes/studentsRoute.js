import express from "express";
import mongoose from "mongoose";
import Course from "../models/courseSchema.js";
import ExamRecord from "../models/examRecordSchema.js";
import Student from "../models/studentSchema.js";
import User from "../models/userSchema.js";

const studentsRouter = express.Router();
const AUTHORIZED_ROLES = new Set(User.schema.path("role").enumValues);
const TERM_ORDER = ExamRecord.schema.path("term").enumValues;

async function requireExamAccess(req, res, next) {
    try {
        const userId = req.user?._id || req.session?.userId || req.session?.user?._id;

        if (!mongoose.isValidObjectId(userId)) {
            return res.status(401).send("Please sign in to view students.");
        }

        const user = await User.findById(userId).select("role isActive").lean();
        if (!user || !user.isActive || !AUTHORIZED_ROLES.has(user.role)) {
            return res.status(403).send("You do not have permission to view students.");
        }

        req.authenticatedUser = user;
        return next();
    } catch (error) {
        return next(error);
    }
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---- Students page: flattens every ExamRecord roster entry into a table row ----
studentsRouter.get("/", requireExamAccess, async (req, res) => {
    try {
        const [examRecords, courses] = await Promise.all([
            ExamRecord.find({})
            .populate({path: "course", select: "courseCode courseName section"})
            .populate({path: "roster.student", select: "studentId firstName middleName middleInitial surname program"})
            .sort({schoolYear: -1, term: 1})
            .lean(),
            Course.find({}).select("courseCode courseName section").sort({courseCode: 1}).lean()
        ]);
        
        const rows = [];

        for (const record of examRecords) {
            if (!record.course) continue;

            for (const entry of record.roster) {
                if (!entry.student) continue;
                const student = entry.student;

                const middleInitial = student.middleInitial
                    ? student.middleInitial.replace(/\.$/, "")
                    : (student.middleName ? student.middleName.charAt(0) : "");

                const isPassed = entry.status === "P" || entry.status === "Passed";

                rows.push({
                    surname: student.surname,
                    firstNameDisplay: middleInitial
                        ? `${student.firstName} ${middleInitial}.`
                        : student.firstName,
                    studentId: student.studentId,
                    courseCode: record.course.courseCode,
                    program: student.program,
                    section: record.course.section,
                    statusLabel: isPassed ? "P" : "C",
                    statusClass: isPassed ? "passed" : "completion",
                    examRecordId: record._id,
                    studentObjectId: student._id
                });
            }
        }

        rows.sort((a, b) => a.surname.localeCompare(b.surname));
        
        const courseOptions = courses.map((course) => ({
            ...course,
            offerings: examRecords
                .filter((record) => record.course && record.course._id.toString() === course._id.toString())
                .map((record) => ({term: record.term, schoolYear: record.schoolYear}))
        }));

        return res.render("students", {students: rows, courseOptions});
    } catch (error) {
        console.error("Error fetching students:", error);
        return res.status(500).send("An error occurred while fetching students.");
    }
});

// ---- API: courses + terms for the Add Students modal dropdowns ----
studentsRouter.get("/api/form-options", requireExamAccess, async (req, res) => {
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
            const courseRecords = recordsByCourse.get(record.course.toString()) || [];
            courseRecords.push({term: record.term, schoolYear: record.schoolYear});
            recordsByCourse.set(record.course.toString(), courseRecords);
        }

        return res.json({
            courses: courses.map((c) => ({
                _id: c._id,
                courseCode: c.courseCode,
                courseName: c.courseName,
                section: c.section,
                offerings: recordsByCourse.get(c._id.toString()) || []
            })),
            terms: TERM_ORDER
        });
    } catch (error) {
        console.error("Unable to load form options:", error);
        return res.status(500).json({ error: "Unable to load form options." });
    }
});

// ---- API: search existing students by name or student ID ----
studentsRouter.get("/api/search", requireExamAccess, async (req, res) => {
    try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (!q) return res.json({ students: [] });

        const pattern = new RegExp(escapeRegex(q), "i");
        const students = await Student.find({
            $or: [
                { studentId: pattern },
                { firstName: pattern },
                { middleName: pattern },
                { surname: pattern }
            ]
        })
            .select("studentId firstName middleName surname program")
            .limit(10)
            .lean();

        return res.json({ students });
    } catch (error) {
        console.error("Unable to search students:", error);
        return res.status(500).json({ error: "Unable to search students." });
    }
});

// ---- API: add one or more students to a course's exam roster ----
studentsRouter.post("/api/add-to-roster", requireExamAccess, async (req, res) => {
    try {
        const { courseId, term, schoolYear, students } = req.body || {};

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
            return res.status(400).json({ error: "At least one student must be provided." });
        }

        const course = await Course.findById(courseId).lean();
        if (!course) {
            return res.status(404).json({ error: "Selected course no longer exists." });
        }

        const resolvedStudentIds = [];

        for (const entry of students) {
            if (entry && entry._id && mongoose.isValidObjectId(entry._id)) {
                resolvedStudentIds.push(entry._id);
                continue;
            }

            const { studentId, surname, firstName, middleName, program } = entry || {};
            if (!/^\d{1,10}$/.test(studentId || "") || !surname || !firstName || !program) {
                return res.status(400).json({
                    error: "Student ID must contain 1 to 10 digits, and each new student needs a surname, first name, and program."
                });
            }

            let student = await Student.findOne({ studentId: studentId.trim() });
            if (!student) {
                student = await Student.create({
                    studentId: studentId.trim(),
                    surname: surname.trim(),
                    firstName: firstName.trim(),
                    middleName: (middleName || "").trim(),
                    program: program.trim().toUpperCase(),
                    section: course.section
                });
            }
            resolvedStudentIds.push(student._id);
        }

        let examRecord = await ExamRecord.findOne({ course: courseId, term, schoolYear });
        if (!examRecord) {
            examRecord = new ExamRecord({ course: courseId, term, schoolYear, roster: [] });
        }

        const existingIds = new Set(examRecord.roster.map((entry) => entry.student.toString()));
        let addedCount = 0;

        for (const studentId of resolvedStudentIds) {
            const idStr = studentId.toString();
            if (existingIds.has(idStr)) continue;
            examRecord.roster.push({ student: studentId });
            existingIds.add(idStr);
            addedCount += 1;
        }

        if (addedCount === 0) {
            return res.status(409).json({ error: "All selected students are already in this exam roster." });
        }

        await examRecord.save();

        return res.status(201).json({
            message: "Students added successfully.",
            examRecordId: examRecord._id
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: "This exam roster already exists with a conflicting entry." });
        }
        console.error("Unable to add students to roster:", error);
        return res.status(500).json({ error: "Unable to add students right now." });
    }
});

export default studentsRouter;