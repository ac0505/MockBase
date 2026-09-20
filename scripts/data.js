document.addEventListener("DOMContentLoaded", () => {
    // ── Elements ──
    const courseSelect = document.getElementById("courseId");
    const sectionSelect = document.getElementById("sectionId");
    const schoolYearSelect = document.getElementById("schoolYear");
    const termSelect = document.getElementById("term");
    const downloadTemplateBtn = document.getElementById("downloadTemplateBtn");
    const dropzone = document.getElementById("dropzone");
    const fileInput = document.getElementById("fileInput");
    const uploadPreview = document.getElementById("uploadPreview");
    const fileName = document.getElementById("fileName");
    const fileSize = document.getElementById("fileSize");
    const removeFileBtn = document.getElementById("removeFileBtn");
    const importSubmitBtn = document.getElementById("importSubmitBtn");
    const importForm = document.getElementById("importForm");
    const uploadAlert = document.getElementById("uploadAlert");

    const exportExcelBtn = document.getElementById("exportExcelBtn");
    const exportPdfBtn = document.getElementById("exportPdfBtn");
    const exportTerm = document.getElementById("exportTerm");
    const exportSchoolYear = document.getElementById("exportSchoolYear");

    let currentParsedStudents = null;
    let availableCourses = [];
    let availableAcademicTerms = [];

    // ── Init Courses ──
    async function loadCourses() {
        try {
            const res = await fetch("/data/api/courses");
            const data = await res.json();
            availableCourses = data.courses || [];
            availableAcademicTerms = data.academicTerms || [];
            schoolYearSelect.innerHTML = '<option value="">Select School Year</option>';
            [...new Set(availableAcademicTerms.map((item) => item.schoolYear))].forEach((schoolYear) => {
                schoolYearSelect.innerHTML += `<option value="${schoolYear}">${schoolYear}</option>`;
            });
        } catch (error) {
            console.error("Failed to load courses", error);
        }
    }
    loadCourses();

    schoolYearSelect.addEventListener("change", () => {
        const terms = [...new Set(availableAcademicTerms.filter((item) => item.schoolYear === schoolYearSelect.value).map((item) => item.term))];
        termSelect.innerHTML = '<option value="">Select Term</option>';
        terms.forEach((term) => { termSelect.innerHTML += `<option value="${term}">${term}</option>`; });
        termSelect.disabled = !terms.length;
        courseSelect.innerHTML = '<option value="">Select Course</option>';
        courseSelect.disabled = true;
        sectionSelect.innerHTML = '<option value="">Select Section</option>';
        sectionSelect.disabled = true;
    });

    termSelect.addEventListener("change", () => {
        const courses = [...new Map(availableCourses.filter((course) => (course.offerings || []).some((offering) => offering.schoolYear === schoolYearSelect.value && offering.term === termSelect.value)).map((course) => [course._id, course])).values()];
        courseSelect.innerHTML = '<option value="">Select Course</option>';
        courses.forEach((course) => { courseSelect.innerHTML += `<option value="${course._id}">${course.courseCode} - ${course.courseName}</option>`; });
        courseSelect.disabled = !courses.length;
        sectionSelect.innerHTML = '<option value="">Select Section</option>';
        sectionSelect.disabled = true;
    });

    courseSelect.addEventListener("change", () => {
        const course = availableCourses.find((item) => item._id === courseSelect.value);
        sectionSelect.innerHTML = '<option value="">Select Section</option>';
        if (course) sectionSelect.innerHTML += `<option value="${course.section}">${course.section}</option>`;
        sectionSelect.disabled = !course;
    });

    downloadTemplateBtn.addEventListener("click", () => {
        const csv = "Student ID,First Name,Middle Name,Last Name,Program,Course Code,Section,Course Name\n";
        const url = URL.createObjectURL(new Blob([csv], {type: "text/csv;charset=utf-8"}));
        const link = document.createElement("a");
        link.href = url;
        link.download = "student-import-template.csv";
        link.click();
        URL.revokeObjectURL(url);
    });

    // ── Helper: Alerts ──
    function showAlert(msg, type = "error", errors = []) {
        uploadAlert.className = `alert alert-${type} show`;
        let html = `<strong>${msg}</strong>`;
        if (errors.length > 0) {
            html += `<ul class="error-list">`;
            errors.forEach(e => html += `<li>${e}</li>`);
            html += `</ul>`;
        }
        uploadAlert.innerHTML = html;
    }

    function hideAlert() {
        uploadAlert.className = "alert";
        uploadAlert.innerHTML = "";
    }

    // ── File Upload Logic ──
    dropzone.addEventListener("click", () => fileInput.click());

    dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("drag-active");
    });

    dropzone.addEventListener("dragleave", () => {
        dropzone.classList.remove("drag-active");
    });

    dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("drag-active");
        if (e.dataTransfer.files.length) {
            fileInput.files = e.dataTransfer.files;
            handleFileSelect();
        }
    });

    fileInput.addEventListener("change", handleFileSelect);

    removeFileBtn.addEventListener("click", () => {
        fileInput.value = "";
        uploadPreview.classList.remove("active");
        dropzone.style.display = "block";
        importSubmitBtn.disabled = true;
        currentParsedStudents = null;
        hideAlert();
    });

    async function handleFileSelect() {
        const file = fileInput.files[0];
        if (!file) return;

        fileName.textContent = file.name;
        fileSize.textContent = (file.size / 1024 / 1024).toFixed(2) + " MB";
        
        dropzone.style.display = "none";
        uploadPreview.classList.add("active");
        hideAlert();
        importSubmitBtn.disabled = true;
        importSubmitBtn.innerHTML = '<span class="material-symbols-outlined">sync</span> Parsing...';

        const formData = new FormData();
        formData.append("file", file);

        try {
            const res = await fetch("/data/api/parse", {
                method: "POST",
                body: formData
            });
            const data = await res.json();
            
            if (!res.ok) {
                showAlert(data.error, "error", data.details || []);
                importSubmitBtn.innerHTML = '<span class="material-symbols-outlined">backup</span> Import Data';
                return;
            }

            currentParsedStudents = data.students;
            if (data.conflicts?.length) {
                showAlert("Resolve these validation issues before importing.", "error", data.conflicts);
                currentParsedStudents = null;
                importSubmitBtn.disabled = true;
                importSubmitBtn.innerHTML = '<span class="material-symbols-outlined">backup</span> Import Data';
                return;
            }
            showAlert(`File parsed successfully. Found ${data.count} valid student records.`, "success");
            importSubmitBtn.disabled = false;
        } catch (error) {
            showAlert("Failed to parse file. Please try again.", "error");
        } finally {
            if (!importSubmitBtn.disabled) {
                importSubmitBtn.innerHTML = '<span class="material-symbols-outlined">backup</span> Import Data';
            }
        }
    }

    // ── Import Submission ──
    importForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        
        if (!currentParsedStudents) {
            showAlert("Please upload and parse a valid file first.", "error");
            return;
        }

        const formData = new FormData(importForm);
            const payload = {
            courseId: formData.get("courseId"),
            term: formData.get("term"),
            schoolYear: formData.get("schoolYear"),
                students: currentParsedStudents,
                courseNames: {}
        };

            const missingNames = (currentParsedStudents || [])
                .filter((student) => student.courseCode && !availableCourses.some((course) => course.courseCode === student.courseCode && course.section === student.section))
                .map((student) => student.courseCode.toUpperCase());
            [...new Set(missingNames)].forEach((courseCode) => {
                const courseName = window.prompt(`Enter a course name for ${courseCode}:`);
                if (courseName) payload.courseNames[courseCode] = courseName.trim();
            });

        importSubmitBtn.disabled = true;
        importSubmitBtn.innerHTML = '<span class="material-symbols-outlined">sync</span> Importing...';
        hideAlert();

        try {
            const res = await fetch("/data/api/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                if (data.requiresConfirmation) {
                    // Simple confirm for this phase
                    const msg = `Some students already exist in the system (but not in this course). Proceed with adding them to this course?`;
                    if (confirm(msg)) {
                        payload.confirmExisting = true;
                        return retryImport(payload);
                    }
                } else {
                    showAlert(data.error, "error");
                }
                importSubmitBtn.disabled = false;
                importSubmitBtn.innerHTML = '<span class="material-symbols-outlined">backup</span> Import Data';
                return;
            }

            showAlert(`Success: ${data.message}`, "success");
            setTimeout(() => {
                window.location.href = `/courses/${data.examRecordId}`;
            }, 1500);

        } catch (error) {
            showAlert("A network error occurred.", "error");
            importSubmitBtn.disabled = false;
            importSubmitBtn.innerHTML = '<span class="material-symbols-outlined">backup</span> Import Data';
        }
    });

    async function retryImport(payload) {
        try {
            const res = await fetch("/data/api/import", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (!res.ok) {
                showAlert(data.error, "error");
            } else {
                showAlert(`Success: ${data.message}`, "success");
                setTimeout(() => window.location.href = `/courses/${data.examRecordId}`, 1500);
            }
        } catch (error) {
            showAlert("A network error occurred.", "error");
        } finally {
            importSubmitBtn.disabled = false;
            importSubmitBtn.innerHTML = '<span class="material-symbols-outlined">backup</span> Import Data';
        }
    }

    // ── Export Logic ──
    function getExportUrl(base) {
        const url = new URL(base, window.location.origin);
        if (exportTerm.value) url.searchParams.append("term", exportTerm.value);
        if (exportSchoolYear.value) url.searchParams.append("schoolYear", exportSchoolYear.value);
        return url.toString();
    }

    exportExcelBtn.addEventListener("click", () => {
        window.location.href = getExportUrl("/data/api/export/xlsx");
    });

    exportPdfBtn.addEventListener("click", () => {
        // Since PDFKit is server side but we want to stick to what we have or generate client side,
        // we can route to an endpoint that sends JSON and generate it, OR just rely on print mode for now.
        // For phase 3 we implemented the /data/api/export/report-data. Let's just open print view of a report page.
        alert("PDF export is currently in development. Please use XLSX export.");
    });
});
