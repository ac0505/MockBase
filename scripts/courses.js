document.addEventListener('DOMContentLoaded', () => {
    const createCourseButton = document.getElementById('createCourseButton');
    const createCourseModal = document.getElementById('createCourseModal');
    const createCourseForm = document.getElementById('createCourseForm');
    const addStudentButton = document.getElementById('openAddStudentButton');
    const addStudentModal = document.getElementById('addStudentModal');
    const addStudentForm = document.getElementById('addStudentForm');
    const stagedRosterBody = document.getElementById('stagedRosterBody');
    const courseFormMessage = document.getElementById('courseFormMessage');
    const studentFormMessage = document.getElementById('studentFormMessage');
    const courseStudentFile = document.getElementById('courseStudentFile');
    const createCourseSchoolYear = document.getElementById('createCourseSchoolYear');
    const rosterStudentFile = document.getElementById('rosterStudentFile');
    const stagedStudents = [];
    let uploadedRosterStudents = [];

    document.querySelectorAll('input[name="studentId"]').forEach((input) => {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 20);
        });
    });
    const editRosterButton = document.getElementById('editRosterButton');
    const rosterAddStudentModal = document.getElementById('rosterAddStudentModal');
    const rosterAddStudentForm = document.getElementById('rosterAddStudentForm');
    const rosterAddMessage = document.getElementById('rosterAddMessage');
    const rosterStagedBody = document.getElementById('rosterStagedBody');
    const rosterStagedCount = document.getElementById('rosterStagedCount');
        const rosterAddStudentButton = document.getElementById('rosterAddStudentButton');
    const studentInfoModal = document.getElementById('studentInfoModal');
    const selectAllRosterStudents = document.getElementById('selectAllRosterStudents');
    const rosterBulkStatusActions = document.getElementById('rosterBulkStatusActions');
    const rosterBulkStatus = document.getElementById('rosterBulkStatus');
    const applyRosterBulkStatus = document.getElementById('applyRosterBulkStatus');
    const selectAllExamRecords = document.getElementById('selectAllExamRecords');
    const examBulkStatusActions = document.getElementById('examBulkStatusActions');
    const examBulkStatus = document.getElementById('examBulkStatus');
    const applyExamBulkStatus = document.getElementById('applyExamBulkStatus');

    function setModalVisibility(modal, visible) {
        if (!modal) return;
        modal.hidden = !visible;
        modal.setAttribute('aria-hidden', String(!visible));
    }

    function showMessage(element, message = '') {
        if (element) element.textContent = message;
    }

    function syncBulkActionVisibility(selector, container) {
        if (!container) return;
        container.hidden = !document.querySelector(`${selector}:checked`);
    }

    selectAllRosterStudents?.addEventListener('change', () => {
        document.querySelectorAll('.roster-student-select').forEach((checkbox) => { checkbox.checked = selectAllRosterStudents.checked; });
        syncBulkActionVisibility('.roster-student-select', rosterBulkStatusActions);
    });
    document.querySelectorAll('.roster-student-select').forEach((checkbox) => checkbox.addEventListener('change', () => syncBulkActionVisibility('.roster-student-select', rosterBulkStatusActions)));
    applyRosterBulkStatus?.addEventListener('click', async () => {
        const studentIds = [...document.querySelectorAll('.roster-student-select:checked')].map((checkbox) => checkbox.value);
        if (!rosterBulkStatus.value || !studentIds.length) return;
        const response = await fetch(`/courses/api/${editRosterButton.dataset.examRecordId}/roster/status`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ studentIds, status: rosterBulkStatus.value }) });
        if (!response.ok) return window.alert((await response.json().catch(() => ({}))).error || 'Unable to update statuses.');
        window.location.reload();
    });

    selectAllExamRecords?.addEventListener('change', () => {
        document.querySelectorAll('.exam-record-select').forEach((checkbox) => { checkbox.checked = selectAllExamRecords.checked; });
        syncBulkActionVisibility('.exam-record-select', examBulkStatusActions);
    });
    document.querySelectorAll('.exam-record-select').forEach((checkbox) => checkbox.addEventListener('change', () => syncBulkActionVisibility('.exam-record-select', examBulkStatusActions)));
    applyExamBulkStatus?.addEventListener('click', async () => {
        const examRecordIds = [...document.querySelectorAll('.exam-record-select:checked')].map((checkbox) => checkbox.value);
        if (!examBulkStatus.value || !examRecordIds.length) return;
        const response = await fetch('/courses/api/roster/status', { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ examRecordIds, status: examBulkStatus.value }) });
        if (!response.ok) return window.alert((await response.json().catch(() => ({}))).error || 'Unable to update statuses.');
        window.location.reload();
    });

    document.querySelectorAll('.edit-course-name').forEach((button) => button.addEventListener('click', async () => {
        const courseName = window.prompt('Course name:', button.dataset.courseName);
        if (!courseName?.trim()) return;
        const response = await fetch(`/courses/api/courses/${button.dataset.courseId}`, { method: 'PATCH', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ courseName: courseName.trim() }) });
        if (!response.ok) return window.alert((await response.json().catch(() => ({}))).error || 'Unable to update course name.');
        window.location.reload();
    }));

    async function loadConfiguredSchoolYears() {
        if (!createCourseSchoolYear) return;
        const response = await fetch('/api/active-terms');
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to load school years.');

        const schoolYears = [...new Set((result.terms || []).map((term) => term.schoolYear))];
        createCourseSchoolYear.innerHTML = '<option value="">Select school year...</option>';
        schoolYears.forEach((schoolYear) => {
            const option = document.createElement('option');
            option.value = schoolYear;
            option.textContent = schoolYear;
            createCourseSchoolYear.appendChild(option);
        });
    }

    loadConfiguredSchoolYears().catch((error) => {
        showMessage(courseFormMessage, error.message);
    });

    async function parseStudentFile(file) {
        const formData = new FormData();
        formData.append('file', file);
        const response = await fetch('/courses/api/parse-students', { method: 'POST', body: formData });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to read the student file.');
        return result.students || [];
    }

    function appendStudents(target, students) {
        const identity = (student) => [student.surname, student.firstName, student.middleName].map((value) => String(value || '').trim().replace(/\s+/g, ' ').toLowerCase()).join('|');
        const existingIds = new Set(target.map((student) => String(student.studentId).trim()));
        const existingNames = new Set(target.map(identity));
        for (const student of students) {
            if (existingIds.has(String(student.studentId).trim()) || existingNames.has(identity(student))) {
                throw new Error(`Duplicate student in the list: ${student.firstName} ${student.surname}.`);
            }
            target.push(student);
            existingIds.add(String(student.studentId).trim());
            existingNames.add(identity(student));
        }
    }

    function renderStagedStudents() {
        if (!stagedRosterBody) return;
        stagedRosterBody.innerHTML = '';

        if (stagedStudents.length === 0) {
            stagedRosterBody.innerHTML = '<tr id="stagedRosterEmpty"><td class="empty-cell" colspan="5">No students added yet.</td></tr>';
            return;
        }

        stagedStudents.forEach((student, index) => {
            const row = document.createElement('tr');
            [student.firstName, student.surname, student.studentId, student.program].forEach((value) => {
                const cell = document.createElement('td');
                cell.textContent = value;
                row.appendChild(cell);
            });
            const actionCell = document.createElement('td');
            actionCell.className = 'action-cell';
            const removeButton = document.createElement('button');
            removeButton.className = 'icon-button remove-staged-student';
            removeButton.type = 'button';
            removeButton.dataset.index = index;
            removeButton.setAttribute('aria-label', `Remove ${student.studentId}`);
            removeButton.title = 'Remove student';
            removeButton.textContent = '\u00d7';
            actionCell.appendChild(removeButton);
            row.appendChild(actionCell);
            stagedRosterBody.appendChild(row);
        });
    }

    function renderRosterStagedStudents(students) {
        if (!rosterStagedBody) return;
        rosterStagedBody.innerHTML = '';
        if (!students.length) {
            rosterStagedBody.innerHTML = '<tr><td class="empty-cell" colspan="5">No students added yet.</td></tr>';
        } else {
            students.forEach((student) => {
                const row = document.createElement('tr');
                [student.firstName, student.surname, student.studentId, student.program].forEach((value) => {
                    const cell = document.createElement('td');
                    cell.textContent = value || '';
                    row.appendChild(cell);
                });
                const actionCell = document.createElement('td');
                actionCell.className = 'action-cell';
                actionCell.textContent = '\u00d7';
                row.appendChild(actionCell);
                rosterStagedBody.appendChild(row);
            });
        }
        if (rosterStagedCount) rosterStagedCount.textContent = students.length ? `${students.length} students staged.` : '';
    }

    function resetStudentForm() {
        if (addStudentForm) addStudentForm.reset();
        showMessage(studentFormMessage);
    }

    createCourseButton?.addEventListener('click', () => {
        setModalVisibility(createCourseModal, true);
        showMessage(courseFormMessage);
    });

    document.querySelectorAll('.close-course-modal').forEach((button) => {
        button.addEventListener('click', () => setModalVisibility(createCourseModal, false));
    });

    addStudentButton?.addEventListener('click', () => {
        resetStudentForm();
        setModalVisibility(addStudentModal, true);
    });

    document.querySelectorAll('.close-student-modal').forEach((button) => {
        button.addEventListener('click', () => setModalVisibility(addStudentModal, false));
    });

    addStudentForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(addStudentForm).entries());
        values.studentId = values.studentId.trim();

        if (stagedStudents.some((student) => student.studentId.toLowerCase() === values.studentId.toLowerCase())) {
            showMessage(studentFormMessage, 'This student is already on the list.');
            return;
        }

        stagedStudents.push(values);
        renderStagedStudents();
        setModalVisibility(addStudentModal, false);
    });

    courseStudentFile?.addEventListener('change', async () => {
        if (!courseStudentFile.files[0]) return;
        try {
            appendStudents(stagedStudents, await parseStudentFile(courseStudentFile.files[0]));
            renderStagedStudents();
            showMessage(courseFormMessage, `${stagedStudents.length} students staged.`);
        } catch (error) {
            showMessage(courseFormMessage, error.message);
        } finally {
            courseStudentFile.value = '';
        }
    });

    stagedRosterBody?.addEventListener('click', (event) => {
        const removeButton = event.target.closest('.remove-staged-student');
        if (!removeButton) return;
        stagedStudents.splice(Number(removeButton.dataset.index), 1);
        renderStagedStudents();
        if (stagedStudents.length === 0 && addStudentButton) addStudentButton.textContent = '+ Add Students';
    });

    createCourseForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        showMessage(courseFormMessage);
        const formValues = Object.fromEntries(new FormData(createCourseForm).entries());

        try {
            const submitCourse = (confirmExisting = false) => fetch('/courses/api/create-course', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formValues, students: stagedStudents, confirmExisting })
            });
            let response = await submitCourse();
            const responseText = await response.text();
            let result = {};
            try { result = responseText ? JSON.parse(responseText) : {}; } catch { throw new Error(`Create course failed with HTTP ${response.status}.`); }
            if (response.status === 409 && result.requiresConfirmation) {
                const existing = result.existingStudents.map((student) => `${student.firstName} ${student.surname} (${student.studentId})`).join(', ');
                if (!window.confirm(`These students already exist: ${existing}. Add them together with the new students?`)) return;
                response = await submitCourse(true);
                result = await response.json().catch(() => ({}));
            }
            if (!response.ok) throw new Error(result.error || 'Unable to create course.');
            window.location.href = '/courses';
        } catch (error) {
            showMessage(courseFormMessage, error.message);
        }
    });

    document.querySelectorAll('.delete-roster-student').forEach((button) => {
        button.addEventListener('click', async () => {
            if (!window.confirm('Remove this student from the roster?')) return;
            const { examRecordId, studentId } = button.dataset;
            const response = await fetch(`/courses/api/${examRecordId}/roster/${studentId}`, { method: 'DELETE' });
            if (!response.ok) {
                const result = await response.json().catch(() => ({}));
                window.alert(result.error || 'Unable to remove student.');
                return;
            }
            button.closest('tr')?.remove();
        });
    });

    editRosterButton?.addEventListener('click', () => {
        uploadedRosterStudents = [];
        renderRosterStagedStudents(uploadedRosterStudents);
        if (rosterAddStudentForm) rosterAddStudentForm.noValidate = false;
        rosterAddStudentForm?.reset();
        showMessage(rosterAddMessage);
        setModalVisibility(rosterAddStudentModal, true);
    });

    document.querySelectorAll('.close-roster-add').forEach((button) => {
        button.addEventListener('click', () => setModalVisibility(rosterAddStudentModal, false));
    });

        rosterAddStudentButton?.addEventListener('click', () => {
            rosterAddStudentForm?.querySelector('input[name="firstName"]')?.focus();
        });

    rosterAddStudentForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const examRecordId = editRosterButton.dataset.examRecordId;
        const values = Object.fromEntries(new FormData(rosterAddStudentForm).entries());
        const studentsToAdd = uploadedRosterStudents.length ? uploadedRosterStudents : [{ ...values }];
        values.studentId = (values.studentId || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 20);
        if (!uploadedRosterStudents.length && !/^[A-Za-z0-9-]{1,20}$/.test(values.studentId)) {
            showMessage(rosterAddMessage, 'Student ID must contain 1 to 20 letters, numbers, or hyphens.');
            return;
        }
        const visibleStudentIds = [...document.querySelectorAll('.student-roster-row')]
            .map((row) => row.dataset.studentNumber.toLowerCase());

        if (!uploadedRosterStudents.length && visibleStudentIds.includes(values.studentId.trim().toLowerCase())) {
            showMessage(rosterAddMessage, 'This student is already in the roster.');
            return;
        }

        try {
            const submitRoster = (confirmExisting = false) => fetch(`/courses/api/${examRecordId}/roster`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ students: studentsToAdd.map((student) => ({ ...student, studentId: String(student.studentId).trim() })), confirmExisting })
            });
            let response = await submitRoster();
            const responseText = await response.text();
            let result = {};
            try {
                result = responseText ? JSON.parse(responseText) : {};
            } catch {
                throw new Error(`Unable to add student (HTTP ${response.status}). Please refresh and sign in again.`);
            }
            if (response.status === 409 && result.requiresConfirmation) {
                const existing = result.existingStudents.map((student) => `${student.firstName} ${student.surname} (${student.studentId})`).join(', ');
                if (!window.confirm(`These students already exist: ${existing}. Add them together with the new students?`)) return;
                response = await submitRoster(true);
                result = await response.json().catch(() => ({}));
            }
            if (!response.ok) throw new Error(result.error || `Unable to add student (HTTP ${response.status}).`);
            window.location.reload();
        } catch (error) {
            showMessage(rosterAddMessage, error.message);
        }
    });

    rosterStudentFile?.addEventListener('change', async () => {
        if (!rosterStudentFile.files[0]) return;
        try {
            uploadedRosterStudents = await parseStudentFile(rosterStudentFile.files[0]);
            renderRosterStagedStudents(uploadedRosterStudents);
            rosterAddStudentForm.noValidate = true;
            showMessage(rosterAddMessage, `${uploadedRosterStudents.length} students ready to add.`);
        } catch (error) {
            uploadedRosterStudents = [];
            showMessage(rosterAddMessage, error.message);
        } finally {
            rosterStudentFile.value = '';
        }
    });

    document.querySelectorAll('.view-student-info').forEach((button) => {
        button.addEventListener('click', (event) => {
            event.stopPropagation();
            const row = button.closest('.student-roster-row');
            const fields = {
                infoStudentNumber: row.dataset.studentNumber,
                infoFirstName: row.dataset.firstName,
                infoMiddleName: row.dataset.middleName || '—',
                infoSurname: row.dataset.surname,
                infoProgram: row.dataset.program
            };
            Object.entries(fields).forEach(([id, value]) => {
                const element = document.getElementById(id);
                if (element) element.textContent = value;
            });
            setModalVisibility(studentInfoModal, true);
        });
    });

    document.querySelectorAll('.close-student-info').forEach((button) => {
        button.addEventListener('click', () => setModalVisibility(studentInfoModal, false));
    });

    async function updateRosterEntry(element, payload) {
        const row = element.closest('.student-roster-row');
        const response = await fetch(`/courses/api/${row.dataset.examRecordId}/roster/${row.dataset.studentId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || 'Unable to update roster entry.');
    }

    const rosterUpdateModal = document.getElementById('rosterUpdateModal');
    const rosterUpdateTitle = document.getElementById('rosterUpdateTitle');
    const rosterUpdateMessage = document.getElementById('rosterUpdateMessage');
    const rosterUpdateOptions = document.getElementById('rosterUpdateOptions');
    const saveRosterUpdate = document.getElementById('saveRosterUpdate');
    let pendingRosterUpdate = null;

    function escapeHtml(value) {
        return value.replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    }

    function openRosterUpdate(element, type) {
        const row = element.closest('.student-roster-row');
        const name = escapeHtml(`${row.dataset.firstName} ${row.dataset.surname}`);
        const isStatus = type === 'status';
        const currentValue = element.dataset.value;
        const choices = isStatus
            ? [{ value: 'P', label: 'Passed', className: 'passed' }, { value: 'C', label: 'Completion', className: 'completion' }]
            : [{ value: 'true', label: 'Recorded', className: 'result-recorded' }, { value: 'false', label: 'Not recorded', className: 'result-not-recorded' }];

        rosterUpdateTitle.textContent = isStatus ? 'Update Status' : 'Update Result';
        rosterUpdateMessage.innerHTML = `Choose new ${isStatus ? 'status' : 'result'} for <strong>${name}</strong>:`;
        rosterUpdateOptions.innerHTML = choices.map((choice, index) => `<label class="status-option-card ${choice.value === currentValue ? 'selected' : ''}" for="rosterChoice${index}"><input type="radio" name="rosterUpdateChoice" id="rosterChoice${index}" value="${choice.value}" ${choice.value === currentValue ? 'checked' : ''}><span class="${isStatus ? 'status-badge' : 'result-badge'} ${choice.className}">${isStatus ? choice.value : choice.label}</span><span class="option-label">${choice.label}</span></label>`).join('');
        pendingRosterUpdate = { element, type };
        setModalVisibility(rosterUpdateModal, true);
    }

    document.querySelectorAll('.roster-status-trigger').forEach((button) => button.addEventListener('click', () => openRosterUpdate(button, 'status')));
    document.querySelectorAll('.roster-result-trigger').forEach((button) => button.addEventListener('click', () => openRosterUpdate(button, 'result')));
    rosterUpdateOptions?.addEventListener('change', (event) => {
        rosterUpdateOptions.querySelectorAll('.status-option-card').forEach((card) => card.classList.remove('selected'));
        event.target.closest('.status-option-card')?.classList.add('selected');
    });
    document.querySelectorAll('.close-roster-update').forEach((button) => button.addEventListener('click', () => setModalVisibility(rosterUpdateModal, false)));
    saveRosterUpdate?.addEventListener('click', async () => {
        const selected = rosterUpdateOptions.querySelector('input[name="rosterUpdateChoice"]:checked');
        if (!selected || !pendingRosterUpdate) return;
        const payload = pendingRosterUpdate.type === 'status' ? { status: selected.value } : { recorded: selected.value === 'true' };
        try {
            await updateRosterEntry(pendingRosterUpdate.element, payload);
            pendingRosterUpdate.element.dataset.value = selected.value;
            if (pendingRosterUpdate.type === 'status') {
                pendingRosterUpdate.element.textContent = selected.value;
                pendingRosterUpdate.element.className = `status-badge ${selected.value === 'P' ? 'passed' : 'completion'} roster-status-trigger`;
            } else {
                pendingRosterUpdate.element.textContent = selected.value === 'true' ? 'Recorded' : 'Not recorded';
                pendingRosterUpdate.element.className = `result-badge ${selected.value === 'true' ? 'result-recorded' : 'result-not-recorded'} roster-result-trigger`;
            }
            setModalVisibility(rosterUpdateModal, false);
        } catch (error) {
            window.alert(error.message);
        }
    });
});
