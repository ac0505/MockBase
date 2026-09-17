import express from "express";
import mongoose from "mongoose";
import multer from "multer";
import Course from "../models/courseSchema.js";
import ExamRecord from "../models/examRecordSchema.js";
import Student from "../models/studentSchema.js";
import User from "../models/userSchema.js";
import { parseStudentWorkbook, resolveStudentEntries, StudentImportConflictError } from "../utils/studentImport.js";

const coursesRouter = express.Router();
const AUTHORIZED_ROLES = new Set(User.schema.path("role").enumValues);
const TERM_ORDER = ExamRecord.schema.path("term").enumValues;
const studentUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

function singleQueryValue(value) {
    return typeof value === "string" ? value.trim() : "";
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function requireExamAccess(req, res, next) {
    try {
        const userId = req.user?._id || req.session?.userId || req.session?.user?._id;

        if (!mongoose.isValidObjectId(userId)) {
            return req.path.startsWith("/api/")
                ? res.status(401).json({ error: "Your session has expired. Please sign in again." })
                : res.status(401).send("Please sign in to view exit examinations.");
        }

        const user = await User.findById(userId).select("role isActive").lean();
        if (!user || !user.isActive || !AUTHORIZED_ROLES.has(user.role)) {
            return req.path.startsWith("/api/")
                ? res.status(403).json({ error: "You are not authorized to modify this roster." })
                : res.status(403).send("You are not authorized to view exit examinations.");
        }

        req.authenticatedUser = user;
        return next();
    } catch (error) {
        return next(error);
    }
}

function sortSchoolYears(values) {
    return values.sort((left, right) => {
        const leftStart = Number.parseInt(left.split("-")[0], 10);
        const rightStart = Number.parseInt(right.split("-")[0], 10);
        return rightStart - leftStart || right.localeCompare(left);
    });
}

function buildListQueryString(filters) {
    const params = new URLSearchParams();
    if (filters.search) params.set("search", filters.search);
    if (filters.term) params.set("term", filters.term);
    if (filters.schoolYear) params.set("schoolYear", filters.schoolYear);
    return params.toString();
}

async function getExamRecordWithStudent(examRecordId, studentId) {
    if (!mongoose.isValidObjectId(examRecordId) || !mongoose.isValidObjectId(studentId)) return null;
    return ExamRecord.findOne({ _id: examRecordId, "roster.student": studentId });
}

async function getFilterOptions() {
    const [availableTerms, availableSchoolYears] = await Promise.all([
        ExamRecord.distinct("term"),
        ExamRecord.distinct("schoolYear")
    ]);

    return {
        terms: TERM_ORDER.filter((term) => availableTerms.includes(term)),
        schoolYears: sortSchoolYears(availableSchoolYears)
    };
}

coursesRouter.use(requireExamAccess);

coursesRouter.post("/api/parse-students", (req, res, next) => {
    studentUpload.single("file")(req, res, (error) => {
        if (error) {
            const message = error.code === "LIMIT_FILE_SIZE"
                ? "The student file must be 5 MB or smaller."
                : "Upload a CSV or Excel file using the file field.";
            return res.status(400).json({ error: message });
        }
        return next();
    });
}, (req, res) => {
    try {
        if (!req.file) return res.status(400).json({ error: "Choose a CSV or Excel file first." });
        return res.json({ students: parseStudentWorkbook(req.file.buffer, req.file.originalname) });
    } catch (error) {
        return res.status(400).json({ error: error.message || "Unable to read the student file." });
    }
});

coursesRouter.post("/api/create-course", async (req, res) => {
    try {
        const { courseCode, courseName, section, term, schoolYear, students = [] } = req.body || {};

        if (!courseCode?.trim() || !courseName?.trim() || !section?.trim()) {
            return res.status(400).json({ error: "Course name, code, and section are required." });
        }
        if (!TERM_ORDER.includes(term)) {
            return res.status(400).json({ error: "A valid term must be selected." });
        }
        if (typeof schoolYear !== "string" || !/^\d{4}-\d{4}$/.test(schoolYear)) {
            return res.status(400).json({ error: "Academic year must be in YYYY-YYYY format." });
        }

        const studentIds = await resolveStudentEntries(students, section, req.body?.confirmExisting === true);
        const course = await Course.create({
            courseCode: courseCode.trim().toUpperCase(),
            courseName: courseName.trim(),
            section: section.trim(),
            proctor: req.authenticatedUser._id
        });
        const uniqueStudentIds = [...new Set(studentIds.map((studentId) => studentId.toString()))];
        const examRecord = await ExamRecord.create({
            course: course._id,
            term,
            schoolYear,
            roster: uniqueStudentIds.map((studentId) => ({ student: studentId }))
        });

        return res.status(201).json({ message: "Course created successfully.", examRecordId: examRecord._id });
    } catch (error) {
        if (error instanceof StudentImportConflictError) {
            return res.status(409).json({ error: "Some students already exist. Confirm to add the complete list.", existingStudents: error.existingStudents, newStudents: error.newStudents, requiresConfirmation: true });
        }
        if (error.code === 11000) {
            return res.status(409).json({ error: "A course with this course code already exists." });
        }
        console.error("Unable to create course:", error);
        return res.status(500).json({ error: error.message || "Unable to create course right now." });
    }
});

coursesRouter.delete("/api/:examRecordId/roster/:studentId", async (req, res) => {
    try {
        const { examRecordId, studentId } = req.params;
        if (!mongoose.isValidObjectId(examRecordId) || !mongoose.isValidObjectId(studentId)) {
            return res.status(400).json({ error: "Invalid exam record or student." });
        }

        const examRecord = await ExamRecord.findById(examRecordId);
        if (!examRecord) return res.status(404).json({ error: "Exam record not found." });

        const originalLength = examRecord.roster.length;
        examRecord.roster = examRecord.roster.filter((entry) => entry.student.toString() !== studentId);
        if (examRecord.roster.length === originalLength) {
            return res.status(404).json({ error: "Student is not in this roster." });
        }

        await examRecord.save();
        return res.json({ message: "Student removed from roster." });
    } catch (error) {
        console.error("Unable to remove student from roster:", error);
        return res.status(500).json({ error: "Unable to remove student right now." });
    }
});

coursesRouter.patch("/api/:examRecordId/roster/:studentId", async (req, res) => {
    try {
        const { examRecordId, studentId } = req.params;
        const { status, recorded } = req.body || {};
        const examRecord = await getExamRecordWithStudent(examRecordId, studentId);
        if (!examRecord) return res.status(404).json({ error: "Student is not in this roster." });
        if (status !== undefined && !["P", "C"].includes(status)) {
            return res.status(400).json({ error: "Status must be P or C." });
        }
        if (recorded !== undefined && typeof recorded !== "boolean") {
            return res.status(400).json({ error: "Recorded must be true or false." });
        }

        const entry = examRecord.roster.find((rosterEntry) => rosterEntry.student.toString() === studentId);
        if (status !== undefined) entry.status = status;
        if (recorded !== undefined) {
            entry.recorded = recorded;
            entry.recordedAt = recorded ? new Date() : null;
        }
        await examRecord.save();
        return res.json({ message: "Roster entry updated." });
    } catch (error) {
        console.error("Unable to update roster entry:", error);
        return res.status(500).json({ error: "Unable to update roster entry right now." });
    }
});

coursesRouter.post("/api/:examRecordId/roster", async (req, res) => {
    try {
        const { examRecordId } = req.params;
        const { students } = req.body || {};
        if (!mongoose.isValidObjectId(examRecordId) || !Array.isArray(students) || students.length === 0) {
            return res.status(400).json({ error: "At least one valid student is required." });
        }

        const examRecord = await ExamRecord.findById(examRecordId);
        if (!examRecord) return res.status(404).json({ error: "Exam record not found." });
        const course = await Course.findById(examRecord.course);
        if (!course) return res.status(404).json({ error: "Course not found." });

        const studentIds = await resolveStudentEntries(students, course.section, req.body?.confirmExisting === true);
        const existingIds = new Set(examRecord.roster.map((entry) => entry.student.toString()));
        const newIds = [...new Set(studentIds.map((studentId) => studentId.toString()))]
            .filter((studentId) => !existingIds.has(studentId));
        if (newIds.length === 0) return res.status(409).json({ error: "All selected students are already in this roster." });

        examRecord.roster.push(...newIds.map((studentId) => ({ student: studentId })));
        await examRecord.save();
        return res.status(201).json({ message: "Students added to roster." });
    } catch (error) {
        if (error instanceof StudentImportConflictError) {
            return res.status(409).json({ error: "Some students already exist. Confirm to add the complete list.", existingStudents: error.existingStudents, newStudents: error.newStudents, requiresConfirmation: true });
        }
        console.error("Unable to add students to roster:", error);
        return res.status(error.name === "ValidationError" ? 400 : 500).json({
            error: error.message || "Unable to add students right now."
        });
    }
});

coursesRouter.get("/", async (req, res) => {
    try {
        const filters = {
            search: singleQueryValue(req.query.search).slice(0, 100),
            term: singleQueryValue(req.query.term),
            schoolYear: singleQueryValue(req.query.schoolYear)
        };
        const query = {};

        if (filters.term && TERM_ORDER.includes(filters.term)) {
            query.term = filters.term;
        }
        if (filters.schoolYear) {
            query.schoolYear = filters.schoolYear;
        }

        if (filters.search) {
            const searchPattern = new RegExp(escapeRegex(filters.search), "i");
            const studentNamePatterns = filters.search
                .split(/\s+/)
                .filter(Boolean)
                .map((part) => new RegExp(escapeRegex(part), "i"));
            const [matchingCourses, matchingStudents] = await Promise.all([
                Course.find({
                    $or: [
                        { courseCode: searchPattern },
                        { courseName: searchPattern },
                        { section: searchPattern }
                    ]
                }).distinct("_id"),
                Student.find({
                    $and: studentNamePatterns.map((pattern) => ({
                        $or: [
                            { studentId: pattern },
                            { firstName: pattern },
                            { middleName: pattern },
                            { surname: pattern }
                        ]
                    }))
                }).distinct("_id")
            ]);

            query.$or = [
                { course: { $in: matchingCourses } },
                { "roster.student": { $in: matchingStudents } }
            ];
        }

        const [examRecords, filterOptions] = await Promise.all([
            ExamRecord.find(query)
                .populate({ path: "course", select: "courseCode courseName section" })
                .populate({
                    path: "roster.student",
                    select: "studentId firstName middleName surname program"
                })
                .sort({ schoolYear: -1, term: 1, createdAt: -1 })
                .lean(),
            getFilterOptions()
        ]);
        examRecords.sort((left, right) => {
            const schoolYearOrder = right.schoolYear.localeCompare(left.schoolYear);
            return schoolYearOrder || TERM_ORDER.indexOf(left.term) - TERM_ORDER.indexOf(right.term);
        });

        return res.render("courses", {
            examRecords,
            selectedExamRecord: null,
            filters,
            allTerms: TERM_ORDER,
            terms: filterOptions.terms,
            schoolYears: filterOptions.schoolYears,
            resultCount: examRecords.length,
            listQueryString: buildListQueryString(filters)
        });
    } catch (error) {
        console.error("Unable to load exit examinations:", error);
        return res.status(500).send("Unable to load exit examinations right now.");
    }
});

coursesRouter.get("/:examRecordId/roster", async (req, res) => {
    try {
        const { examRecordId } = req.params;
        if (!mongoose.isValidObjectId(examRecordId)) {
            return res.status(404).send("Exam record not found.");
        }

        const selectedExamRecord = await ExamRecord.findById(examRecordId)
            .populate({ path: "course", select: "courseCode courseName section" })
            .populate({
                path: "roster.student",
                select: "studentId firstName middleName surname program"
            })
            .lean();

        if (!selectedExamRecord || !selectedExamRecord.course) {
            return res.status(404).send("Exam record not found.");
        }

        const filters = {
            search: singleQueryValue(req.query.search).slice(0, 100),
            term: singleQueryValue(req.query.term),
            schoolYear: singleQueryValue(req.query.schoolYear)
        };
        const filterOptions = await getFilterOptions();

        return res.render("courses", {
            examRecords: [],
            selectedExamRecord,
            filters,
            terms: filterOptions.terms,
            schoolYears: filterOptions.schoolYears,
            resultCount: 0,
            listQueryString: buildListQueryString(filters)
        });
    } catch (error) {
        console.error("Unable to load exam roster:", error);
        return res.status(500).send("Unable to load this exam roster right now.");
    }
});

export default coursesRouter;
