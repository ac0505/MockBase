import express from "express";
import mongoose from "mongoose";
import Course from "../models/courseSchema.js";
import ExamRecord from "../models/examRecordSchema.js";
import Student from "../models/studentSchema.js";
import User from "../models/userSchema.js";

const coursesRouter = express.Router();
const AUTHORIZED_ROLES = new Set(User.schema.path("role").enumValues);
const TERM_ORDER = ExamRecord.schema.path("term").enumValues;

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
            return res.status(401).send("Please sign in to view exit examinations.");
        }

        const user = await User.findById(userId).select("role isActive").lean();
        if (!user || !user.isActive || !AUTHORIZED_ROLES.has(user.role)) {
            return res.status(403).send("You are not authorized to view exit examinations.");
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
