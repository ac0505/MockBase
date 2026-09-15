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
    const stagedStudents = [];

    document.querySelectorAll('input[name="studentId"]').forEach((input) => {
        input.addEventListener('input', () => {
            input.value = input.value.replace(/\D/g, '').slice(0, 10);
        });
    });
    const editRosterButton = document.getElementById('editRosterButton');
    const rosterAddStudentModal = document.getElementById('rosterAddStudentModal');
    const rosterAddStudentForm = document.getElementById('rosterAddStudentForm');
    const rosterAddMessage = document.getElementById('rosterAddMessage');
    const studentInfoModal = document.getElementById('studentInfoModal');

    function setModalVisibility(modal, visible) {
        if (!modal) return;
        modal.hidden = !visible;
        modal.setAttribute('aria-hidden', String(!visible));
    }

    function showMessage(element, message = '') {
        if (element) element.textContent = message;
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
        addStudentButton.textContent = 'View Student Roster';
        setModalVisibility(addStudentModal, false);
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
            const response = await fetch('/courses/api/create-course', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ...formValues, students: stagedStudents })
            });
            const responseText = await response.text();
            let result = {};
            try { result = responseText ? JSON.parse(responseText) : {}; } catch { throw new Error(`Create course failed with HTTP ${response.status}.`); }
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
        rosterAddStudentForm?.reset();
        showMessage(rosterAddMessage);
        setModalVisibility(rosterAddStudentModal, true);
    });

    document.querySelectorAll('.close-roster-add').forEach((button) => {
        button.addEventListener('click', () => setModalVisibility(rosterAddStudentModal, false));
    });

    rosterAddStudentForm?.addEventListener('submit', async (event) => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(rosterAddStudentForm).entries());
        const examRecordId = editRosterButton.dataset.examRecordId;
        values.studentId = values.studentId.replace(/\D/g, '').slice(0, 10);
        if (!/^\d{1,10}$/.test(values.studentId)) {
            showMessage(rosterAddMessage, 'Student ID must contain 1 to 10 digits.');
            return;
        }
        const visibleStudentIds = [...document.querySelectorAll('.student-roster-row')]
            .map((row) => row.dataset.studentNumber.toLowerCase());

        if (visibleStudentIds.includes(values.studentId.trim().toLowerCase())) {
            showMessage(rosterAddMessage, 'This student is already in the roster.');
            return;
        }

        try {
            const response = await fetch(`/courses/api/${examRecordId}/roster`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ students: [{ ...values, studentId: values.studentId.trim() }] })
            });
            const responseText = await response.text();
            let result = {};
            try {
                result = responseText ? JSON.parse(responseText) : {};
            } catch {
                throw new Error(`Unable to add student (HTTP ${response.status}). Please refresh and sign in again.`);
            }
            if (!response.ok) throw new Error(result.error || `Unable to add student (HTTP ${response.status}).`);
            window.location.reload();
        } catch (error) {
            showMessage(rosterAddMessage, error.message);
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
