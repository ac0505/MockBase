import express from "express";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import User from "../models/userSchema.js";
import AuditLog from "../models/auditLogSchema.js";
import AcademicTerm from "../models/academicTermSchema.js";
import ExamRecord from "../models/examRecordSchema.js";
import Student from "../models/studentSchema.js";
import Course from "../models/courseSchema.js";

const adminRouter = express.Router();

// ── Admin-only middleware ──
async function requireAdmin(req, res, next) {
    try {
        const userId = req.session?.userId;
        if (!mongoose.isValidObjectId(userId)) {
            return req.path.startsWith("/api/")
                ? res.status(401).json({ error: "Session expired. Please sign in again." })
                : res.redirect("/login");
        }

        const user = await User.findById(userId).select("role isActive firstName lastName").lean();
        if (!user || !user.isActive || user.role !== "admin") {
            return req.path.startsWith("/api/")
                ? res.status(403).json({ error: "Admin access required." })
                : res.status(403).send("Admin access required.");
        }

        req.adminUser = user;
        return next();
    } catch (error) {
        return next(error);
    }
}

adminRouter.use(requireAdmin);

// ── Helper: create audit log entry ──
async function logAction(action, targetType, targetId, performedBy, details = "", metadata = {}) {
    try {
        await AuditLog.create({ action, targetType, targetId, performedBy, details, metadata });
    } catch (error) {
        console.error("Audit log error:", error.message);
    }
}

// ══════════════════════════════════════
//  RENDER ADMIN PAGE
// ══════════════════════════════════════
adminRouter.get("/", (req, res) => {
    res.render("admin", {
        userRole: req.session.role,
        currentUserId: req.session.userId
    });
});

// ══════════════════════════════════════
//  USER MANAGEMENT
// ══════════════════════════════════════

// List all users
adminRouter.get("/api/users", async (req, res) => {
    try {
        const users = await User.find({})
            .select("firstName lastName email username role isActive department createdAt")
            .sort({ createdAt: -1 })
            .lean();
        return res.json({ users });
    } catch (error) {
        console.error("Failed to fetch users:", error);
        return res.status(500).json({ error: "Unable to fetch users." });
    }
});

// Create user
adminRouter.post("/api/users", async (req, res) => {
    try {
        const { firstName, lastName, email, username, password, role, department } = req.body || {};

        if (!firstName?.trim() || !lastName?.trim() || !email?.trim() || !username?.trim() || !password) {
            return res.status(400).json({ error: "First name, last name, email, username, and password are required." });
        }
        if (password.length < 6) {
            return res.status(400).json({ error: "Password must be at least 6 characters." });
        }
        if (role && !["admin", "proctor"].includes(role)) {
            return res.status(400).json({ error: "Role must be admin or proctor." });
        }

        const existingUser = await User.findOne({
            $or: [
                { username: username.trim().toLowerCase() },
                { email: email.trim().toLowerCase() }
            ]
        }).lean();

        if (existingUser) {
            return res.status(409).json({ error: "A user with this username or email already exists." });
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const newUser = await User.create({
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            email: email.trim().toLowerCase(),
            username: username.trim(),
            passwordHash,
            role: role || "proctor",
            department: (department || "").trim(),
            isActive: true
        });

        await logAction("CREATE_USER", "User", newUser._id, req.adminUser._id,
            `Created user ${newUser.username} (${newUser.role})`);

        return res.status(201).json({
            message: "User created successfully.",
            user: {
                _id: newUser._id,
                firstName: newUser.firstName,
                lastName: newUser.lastName,
                email: newUser.email,
                username: newUser.username,
                role: newUser.role,
                isActive: newUser.isActive,
                department: newUser.department
            }
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: "A user with this username or email already exists." });
        }
        console.error("Failed to create user:", error);
        return res.status(500).json({ error: "Unable to create user." });
    }
});

// Update user
adminRouter.patch("/api/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ error: "Invalid user ID." });
        }

        const user = await User.findById(id);
        if (!user) return res.status(404).json({ error: "User not found." });

        const { firstName, lastName, email, role, isActive, department, password } = req.body || {};
        const changes = [];

        if (firstName?.trim()) { user.firstName = firstName.trim(); changes.push("firstName"); }
        if (lastName?.trim()) { user.lastName = lastName.trim(); changes.push("lastName"); }
        if (email?.trim()) {
            const emailLower = email.trim().toLowerCase();
            if (emailLower !== user.email) {
                const exists = await User.findOne({ email: emailLower, _id: { $ne: id } }).lean();
                if (exists) return res.status(409).json({ error: "This email is already taken." });
                user.email = emailLower;
                changes.push("email");
            }
        }
        if (role && ["admin", "proctor"].includes(role)) { user.role = role; changes.push("role"); }
        if (typeof isActive === "boolean") { user.isActive = isActive; changes.push("isActive"); }
        if (department !== undefined) { user.department = (department || "").trim(); changes.push("department"); }

        if (password) {
            if (password.length < 6) {
                return res.status(400).json({ error: "Password must be at least 6 characters." });
            }
            user.passwordHash = await bcrypt.hash(password, 10);
            changes.push("password");

            await logAction("RESET_PASSWORD", "User", user._id, req.adminUser._id,
                `Reset password for ${user.username}`);
        }

        await user.save();

        await logAction("UPDATE_USER", "User", user._id, req.adminUser._id,
            `Updated ${user.username}: ${changes.join(", ")}`);

        return res.json({
            message: "User updated successfully.",
            user: {
                _id: user._id,
                firstName: user.firstName,
                lastName: user.lastName,
                email: user.email,
                username: user.username,
                role: user.role,
                isActive: user.isActive,
                department: user.department
            }
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: "This email or username is already taken." });
        }
        console.error("Failed to update user:", error);
        return res.status(500).json({ error: "Unable to update user." });
    }
});

// Delete user
adminRouter.delete("/api/users/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ error: "Invalid user ID." });
        }
        if (id === req.adminUser._id.toString()) {
            return res.status(400).json({ error: "You cannot delete your own account." });
        }

        const user = await User.findByIdAndDelete(id);
        if (!user) return res.status(404).json({ error: "User not found." });

        await logAction("DELETE_USER", "User", user._id, req.adminUser._id,
            `Deleted user ${user.username} (${user.role})`);

        return res.json({ message: "User deleted successfully." });
    } catch (error) {
        console.error("Failed to delete user:", error);
        return res.status(500).json({ error: "Unable to delete user." });
    }
});

// ══════════════════════════════════════
//  ACADEMIC TERM CONFIGURATION
// ══════════════════════════════════════

// List all terms
adminRouter.get("/api/terms", async (req, res) => {
    try {
        const terms = await AcademicTerm.find({})
            .populate("createdBy", "firstName lastName username")
            .sort({ schoolYear: -1, term: 1 })
            .lean();
        return res.json({ terms });
    } catch (error) {
        console.error("Failed to fetch terms:", error);
        return res.status(500).json({ error: "Unable to fetch terms." });
    }
});

// Get active terms only (also accessible by non-admin authenticated users)
adminRouter.get("/api/active-terms", async (req, res) => {
    try {
        const terms = await AcademicTerm.find({ isActive: true })
            .select("schoolYear term")
            .sort({ schoolYear: -1, term: 1 })
            .lean();
        return res.json({ terms });
    } catch (error) {
        console.error("Failed to fetch active terms:", error);
        return res.status(500).json({ error: "Unable to fetch active terms." });
    }
});

// Create term config
adminRouter.post("/api/terms", async (req, res) => {
    try {
        const { schoolYear, term } = req.body || {};

        if (!schoolYear?.trim() || !/^\d{4}-\d{4}$/.test(schoolYear.trim())) {
            return res.status(400).json({ error: "School year must be in YYYY-YYYY format." });
        }
        if (!["1st Term", "2nd Term", "3rd Term"].includes(term)) {
            return res.status(400).json({ error: "Term must be 1st Term, 2nd Term, or 3rd Term." });
        }

        const existing = await AcademicTerm.findOne({ schoolYear: schoolYear.trim(), term }).lean();
        if (existing) {
            return res.status(409).json({ error: "This term configuration already exists." });
        }

        const newTerm = await AcademicTerm.create({
            schoolYear: schoolYear.trim(),
            term,
            isActive: true,
            createdBy: req.adminUser._id
        });

        await logAction("CREATE_TERM_CONFIG", "AcademicTerm", newTerm._id, req.adminUser._id,
            `Created term config: ${term} ${schoolYear}`);

        return res.status(201).json({ message: "Term configuration created.", term: newTerm });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({ error: "This term configuration already exists." });
        }
        console.error("Failed to create term:", error);
        return res.status(500).json({ error: "Unable to create term configuration." });
    }
});

// Update term config (toggle active status)
adminRouter.patch("/api/terms/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ error: "Invalid term ID." });
        }

        const termConfig = await AcademicTerm.findById(id);
        if (!termConfig) return res.status(404).json({ error: "Term configuration not found." });

        const { isActive } = req.body || {};
        if (typeof isActive === "boolean") {
            termConfig.isActive = isActive;
        }

        await termConfig.save();

        await logAction("UPDATE_TERM_CONFIG", "AcademicTerm", termConfig._id, req.adminUser._id,
            `${isActive ? "Activated" : "Deactivated"} term: ${termConfig.term} ${termConfig.schoolYear}`);

        return res.json({ message: "Term configuration updated.", term: termConfig });
    } catch (error) {
        console.error("Failed to update term:", error);
        return res.status(500).json({ error: "Unable to update term configuration." });
    }
});

// Delete term config
adminRouter.delete("/api/terms/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ error: "Invalid term ID." });
        }

        const termConfig = await AcademicTerm.findByIdAndDelete(id);
        if (!termConfig) return res.status(404).json({ error: "Term configuration not found." });

        await logAction("DELETE_TERM_CONFIG", "AcademicTerm", termConfig._id, req.adminUser._id,
            `Deleted term config: ${termConfig.term} ${termConfig.schoolYear}`);

        return res.json({ message: "Term configuration deleted." });
    } catch (error) {
        console.error("Failed to delete term:", error);
        return res.status(500).json({ error: "Unable to delete term configuration." });
    }
});

// ══════════════════════════════════════
//  AUDIT LOGS
// ══════════════════════════════════════

adminRouter.get("/api/audit-logs", async (req, res) => {
    try {
        const page = Math.max(1, parseInt(req.query.page, 10) || 1);
        const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
        const skip = (page - 1) * limit;

        const filter = {};
        if (req.query.action) filter.action = req.query.action;
        if (req.query.targetType) filter.targetType = req.query.targetType;
        if (mongoose.isValidObjectId(req.query.userId)) filter.performedBy = req.query.userId;

        if (req.query.startDate || req.query.endDate) {
            filter.createdAt = {};
            if (req.query.startDate) filter.createdAt.$gte = new Date(req.query.startDate);
            if (req.query.endDate) filter.createdAt.$lte = new Date(req.query.endDate + "T23:59:59.999Z");
        }

        const [logs, total] = await Promise.all([
            AuditLog.find(filter)
                .populate("performedBy", "firstName lastName username")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            AuditLog.countDocuments(filter)
        ]);

        return res.json({
            logs,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        console.error("Failed to fetch audit logs:", error);
        return res.status(500).json({ error: "Unable to fetch audit logs." });
    }
});

// ══════════════════════════════════════
//  OVERRIDES & CLEANUP
// ══════════════════════════════════════

// Unlock a locked exam record
adminRouter.post("/api/unlock-record/:examRecordId", async (req, res) => {
    try {
        const { examRecordId } = req.params;
        if (!mongoose.isValidObjectId(examRecordId)) {
            return res.status(400).json({ error: "Invalid exam record ID." });
        }

        const examRecord = await ExamRecord.findById(examRecordId).populate("course", "courseCode");
        if (!examRecord) return res.status(404).json({ error: "Exam record not found." });

        examRecord.isLocked = false;
        examRecord.lockedAt = null;
        examRecord.lockedBy = null;
        await examRecord.save();

        const courseCode = examRecord.course?.courseCode || "Unknown";
        await logAction("UNLOCK_RECORD", "ExamRecord", examRecord._id, req.adminUser._id,
            `Unlocked exam record for ${courseCode} (${examRecord.term} ${examRecord.schoolYear})`);

        return res.json({ message: "Exam record unlocked successfully." });
    } catch (error) {
        console.error("Failed to unlock record:", error);
        return res.status(500).json({ error: "Unable to unlock exam record." });
    }
});

// Lock an exam record
adminRouter.post("/api/lock-record/:examRecordId", async (req, res) => {
    try {
        const { examRecordId } = req.params;
        if (!mongoose.isValidObjectId(examRecordId)) {
            return res.status(400).json({ error: "Invalid exam record ID." });
        }

        const examRecord = await ExamRecord.findById(examRecordId).populate("course", "courseCode");
        if (!examRecord) return res.status(404).json({ error: "Exam record not found." });

        examRecord.isLocked = true;
        examRecord.lockedAt = new Date();
        examRecord.lockedBy = req.adminUser._id;
        await examRecord.save();

        const courseCode = examRecord.course?.courseCode || "Unknown";
        await logAction("LOCK_RECORD", "ExamRecord", examRecord._id, req.adminUser._id,
            `Locked exam record for ${courseCode} (${examRecord.term} ${examRecord.schoolYear})`);

        return res.json({ message: "Exam record locked successfully." });
    } catch (error) {
        console.error("Failed to lock record:", error);
        return res.status(500).json({ error: "Unable to lock exam record." });
    }
});

// Merge duplicate students
adminRouter.post("/api/merge-students", async (req, res) => {
    try {
        const { keepId, mergeId } = req.body || {};

        if (!mongoose.isValidObjectId(keepId) || !mongoose.isValidObjectId(mergeId)) {
            return res.status(400).json({ error: "Both student IDs are required." });
        }
        if (keepId === mergeId) {
            return res.status(400).json({ error: "Cannot merge a student with themselves." });
        }

        const [keepStudent, mergeStudent] = await Promise.all([
            Student.findById(keepId),
            Student.findById(mergeId)
        ]);

        if (!keepStudent) return res.status(404).json({ error: "Primary student not found." });
        if (!mergeStudent) return res.status(404).json({ error: "Duplicate student not found." });

        // Update all roster references from mergeId to keepId
        const examRecords = await ExamRecord.find({ "roster.student": mergeId });
        let updatedCount = 0;

        for (const record of examRecords) {
            const hasKeep = record.roster.some((e) => e.student.toString() === keepId);
            if (hasKeep) {
                // Remove the duplicate entry since primary is already in roster
                record.roster = record.roster.filter((e) => e.student.toString() !== mergeId);
            } else {
                // Replace the merge student ref with the keep student ref
                const entry = record.roster.find((e) => e.student.toString() === mergeId);
                if (entry) entry.student = keepStudent._id;
            }
            await record.save();
            updatedCount++;
        }

        // Delete the duplicate student
        await Student.findByIdAndDelete(mergeId);

        await logAction("MERGE_STUDENTS", "Student", keepStudent._id, req.adminUser._id,
            `Merged student ${mergeStudent.studentId} (${mergeStudent.firstName} ${mergeStudent.surname}) into ${keepStudent.studentId} (${keepStudent.firstName} ${keepStudent.surname}). Updated ${updatedCount} exam records.`);

        return res.json({
            message: `Students merged successfully. ${updatedCount} exam records updated.`,
            keptStudent: {
                _id: keepStudent._id,
                studentId: keepStudent.studentId,
                firstName: keepStudent.firstName,
                surname: keepStudent.surname
            }
        });
    } catch (error) {
        console.error("Failed to merge students:", error);
        return res.status(500).json({ error: "Unable to merge students." });
    }
});

// Delete a student record
adminRouter.delete("/api/students/:id", async (req, res) => {
    try {
        const { id } = req.params;
        if (!mongoose.isValidObjectId(id)) {
            return res.status(400).json({ error: "Invalid student ID." });
        }

        const student = await Student.findById(id);
        if (!student) return res.status(404).json({ error: "Student not found." });

        // Remove from all rosters
        await ExamRecord.updateMany(
            { "roster.student": id },
            { $pull: { roster: { student: id } } }
        );

        await Student.findByIdAndDelete(id);

        await logAction("DELETE_STUDENT", "Student", student._id, req.adminUser._id,
            `Deleted student ${student.studentId} (${student.firstName} ${student.surname})`);

        return res.json({ message: "Student deleted successfully." });
    } catch (error) {
        console.error("Failed to delete student:", error);
        return res.status(500).json({ error: "Unable to delete student." });
    }
});

// Search students (for merge UI)
adminRouter.get("/api/students/search", async (req, res) => {
    try {
        const q = typeof req.query.q === "string" ? req.query.q.trim() : "";
        if (!q) return res.json({ students: [] });

        const pattern = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
        const students = await Student.find({
            $or: [
                { studentId: pattern },
                { firstName: pattern },
                { surname: pattern }
            ]
        })
            .select("studentId firstName middleName surname program section")
            .limit(20)
            .lean();

        return res.json({ students });
    } catch (error) {
        console.error("Failed to search students:", error);
        return res.status(500).json({ error: "Unable to search students." });
    }
});

// ══════════════════════════════════════
//  SYSTEM-WIDE ANALYTICS
// ══════════════════════════════════════

adminRouter.get("/api/analytics", async (req, res) => {
    try {
        const examRecords = await ExamRecord.find({})
            .populate({ path: "course", select: "courseCode courseName" })
            .populate({ path: "roster.student", select: "program" })
            .lean();

        let totalStudents = 0;
        let totalPassed = 0;
        let totalCompletion = 0;
        const programMap = new Map();
        const courseMap = new Map();

        for (const record of examRecords) {
            if (!record.course) continue;
            const courseCode = record.course.courseCode;

            if (!courseMap.has(courseCode)) {
                courseMap.set(courseCode, { courseCode, courseName: record.course.courseName, students: 0, passed: 0, completion: 0 });
            }
            const courseBucket = courseMap.get(courseCode);

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

        return res.json({
            overview: { totalStudents, totalPassed, totalCompletion },
            programStats: [...programMap.values()].sort((a, b) => a.program.localeCompare(b.program)),
            courseStats: [...courseMap.values()].sort((a, b) => a.courseCode.localeCompare(b.courseCode))
        });
    } catch (error) {
        console.error("Failed to load analytics:", error);
        return res.status(500).json({ error: "Unable to load analytics." });
    }
});

// Get all exam records (for overrides view)
adminRouter.get("/api/exam-records", async (req, res) => {
    try {
        const examRecords = await ExamRecord.find({})
            .populate({ path: "course", select: "courseCode courseName section" })
            .select("course term schoolYear isLocked lockedAt roster")
            .sort({ schoolYear: -1, term: 1 })
            .lean();

        const records = examRecords
            .filter((r) => r.course)
            .map((r) => ({
                _id: r._id,
                courseCode: r.course.courseCode,
                courseName: r.course.courseName,
                section: r.course.section,
                term: r.term,
                schoolYear: r.schoolYear,
                isLocked: r.isLocked || false,
                lockedAt: r.lockedAt,
                studentCount: r.roster?.length || 0
            }));

        return res.json({ records });
    } catch (error) {
        console.error("Failed to fetch exam records:", error);
        return res.status(500).json({ error: "Unable to fetch exam records." });
    }
});

export default adminRouter;
