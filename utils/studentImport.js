import mongoose from "mongoose";
import XLSX from "xlsx";
import Student from "../models/studentSchema.js";

export class StudentImportConflictError extends Error {
    constructor(existingStudents, newStudents) {
        super("Some imported students already exist.");
        this.name = "StudentImportConflictError";
        this.existingStudents = existingStudents;
        this.newStudents = newStudents;
    }
}

function normalizePart(value) {
    return String(value || "").trim().replace(/\s+/g, " ").toLowerCase();
}

function displayStudent(student) {
    return {
        studentId: student.studentId,
        firstName: student.firstName,
        middleName: student.middleName || "",
        surname: student.surname,
        program: student.program
    };
}

function identityMatches(left, right) {
    return normalizePart(left.firstName) === normalizePart(right.firstName)
        && normalizePart(left.middleName) === normalizePart(right.middleName)
        && normalizePart(left.surname) === normalizePart(right.surname);
}

function valueFor(row, aliases) {
    const entries = Object.entries(row);
    const match = entries.find(([key]) => {
        const normalizedKey = normalizeHeader(key);
        return aliases.includes(normalizedKey);
    });
    return match ? String(match[1] ?? "").trim() : "";
}

function normalizeHeader(value) {
    return normalizePart(String(value).replace(/^\uFEFF/, "")).replace(/[^a-z0-9]/g, "");
}

function isValidStudentId(value) {
    return /^[A-Za-z0-9-]{1,20}$/.test(String(value || "").trim());
}

export function parseStudentWorkbook(buffer, originalName = "") {
    let workbook;
    try {
        workbook = XLSX.read(buffer, { type: "buffer" });
    } catch {
        throw new Error("The uploaded file could not be read. Use a CSV or Excel file.");
    }

    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rawRows = sheet ? XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "", blankrows: false }) : [];
    const headerIndex = rawRows.findIndex((row) => {
        const headers = row.map(normalizeHeader);
        const hasStudentId = headers.some((header) => ["studentid", "studentidnumber", "studentnumber", "studentno", "studentnumberid", "studentidno", "idnumber", "id"].includes(header));
        const hasName = headers.some((header) => ["firstname", "givenname", "firstname/mi", "firstnamemi", "firstnamemiddleinitial", "surname", "lastname", "familyname"].includes(header));
        return hasStudentId && hasName;
    });
    if (headerIndex < 0) throw new Error("The file must contain headers for student ID, first name, and last name.");

    const headers = rawRows[headerIndex];
    const rows = rawRows.slice(headerIndex + 1).map((values) => Object.fromEntries(headers.map((header, columnIndex) => [header, values[columnIndex] ?? ""])));
    if (!rows.length) throw new Error("The uploaded file has no student rows.");

    const students = rows.map((row, index) => {
        const combinedFirstName = valueFor(row, ["firstname/mi", "firstnamemi", "firstnamemiddleinitial"]);
        const combinedNameParts = combinedFirstName.split(/\s+/).filter(Boolean);
        const student = {
            studentId: valueFor(row, ["studentid", "studentidnumber", "studentnumber", "studentno", "studentnumberid", "studentidno", "idnumber", "id"]),
            firstName: valueFor(row, ["firstname", "givenname"]) || combinedNameParts.shift() || "",
            middleName: valueFor(row, ["middlename", "middleinitial", "mi"]),
            surname: valueFor(row, ["surname", "lastname", "familyname"]),
            program: valueFor(row, ["program", "programcode", "degree"]),
            courseCode: valueFor(row, ["coursecode", "course", "subjectcode"]),
            section: valueFor(row, ["section", "sectioncode", "classsection"]),
            courseName: valueFor(row, ["coursename", "subjectname"])
        };
        if (!student.middleName && combinedNameParts.length) student.middleName = combinedNameParts.join(" ");
        if (!student.studentId && !student.firstName && !student.surname) return null;
        if (!isValidStudentId(student.studentId) || !student.firstName || !student.surname || !student.program) {
            throw new Error(`Row ${headerIndex + index + 2} in ${originalName || "the uploaded file"} needs student ID, first name, last name, and program.`);
        }
        return student;
    }).filter(Boolean);

    if (!students.length) throw new Error("The uploaded file has no valid student rows.");
    return students;
}

async function inspectStudent(student) {
    const studentId = String(student.studentId || "").trim();
    if (!isValidStudentId(studentId) || !student.firstName?.trim() || !student.surname?.trim() || !student.program?.trim()) {
        throw new Error("Each student needs a student ID, first name, last name, and program.");
    }

    const byId = await Student.findOne({ studentId }).lean();
    if (byId && !identityMatches(byId, student)) {
        throw new Error(`Student ID ${studentId} is already assigned to a different student.`);
    }
    if (byId) return byId;

    const candidates = await Student.find({
        firstName: new RegExp(`^${escapeRegex(student.firstName.trim())}$`, "i"),
        middleName: new RegExp(`^${escapeRegex((student.middleName || "").trim())}$`, "i"),
        surname: new RegExp(`^${escapeRegex(student.surname.trim())}$`, "i")
    }).lean();
    if (candidates.some((candidate) => identityMatches(candidate, student))) {
        throw new Error(`A student with the same first name, middle name, and last name already exists with a different student ID.`);
    }
    return null;
}

function escapeRegex(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function resolveStudentEntries(entries, section, confirmExisting = false) {
    if (!Array.isArray(entries)) return [];

    const inspected = [];
    const seenIds = new Set();
    const seenIdentities = new Set();
    for (const entry of entries) {
        const student = entry && entry._id && mongoose.isValidObjectId(entry._id)
            ? await Student.findById(entry._id).lean()
            : await inspectStudent(entry || {});
        const submitted = entry || {};
        const identityKey = [submitted.surname, submitted.firstName, submitted.middleName].map(normalizePart).join("|");
        const idKey = String(submitted.studentId || student?.studentId || "").trim();
        if (seenIds.has(idKey) || seenIdentities.has(identityKey)) {
            throw new Error("The import contains duplicate student entries.");
        }
        seenIds.add(idKey);
        seenIdentities.add(identityKey);
        inspected.push({ entry: submitted, student });
    }

    const existingStudents = inspected.filter(({ student }) => student).map(({ student }) => displayStudent(student));
    const newStudents = inspected.filter(({ student }) => !student).map(({ entry }) => displayStudent(entry));
    if (existingStudents.length && newStudents.length && !confirmExisting) {
        throw new StudentImportConflictError(existingStudents, newStudents);
    }

    const resolvedIds = [];
    for (const { entry, student } of inspected) {
        const resolved = student || await Student.create({
            studentId: entry.studentId.trim(),
            surname: entry.surname.trim(),
            firstName: entry.firstName.trim(),
            middleName: (entry.middleName || "").trim(),
            program: entry.program.trim().toUpperCase(),
            section: section.trim()
        });
        resolvedIds.push(resolved._id);
    }
    return resolvedIds;
}