    document.addEventListener('DOMContentLoaded', () => {
        // --- UI Controls ---
        const filterBtn = document.getElementById('filterBtn');
        const filterDropdown = document.getElementById('filterDropdown');
        const btnCloseFilter = document.getElementById('btnCloseFilter');
        const btnResetFilter = document.getElementById('btnResetFilter');
        const btnApplyFilter = document.getElementById('btnApplyFilter');

        const addStudentBtn = document.getElementById('addStudentBtn');
        const studentSearch = document.getElementById('studentSearch');
        const tableBody = document.getElementById('tableBody');
        const noResultsRow = document.getElementById('noResultsRow');

        // Filter Select Dropdowns
        const filterProgram = document.getElementById('filterProgram');
        const filterCourse = document.getElementById('filterCourse');
        const filterSection = document.getElementById('filterSection');
        const filterActiveBadge = document.getElementById('filterActiveBadge');
        const newStudentIdInput = document.getElementById('asNewStudentId');

        if (newStudentIdInput) {
            newStudentIdInput.addEventListener('input', () => {
                newStudentIdInput.value = newStudentIdInput.value.replace(/[^A-Za-z0-9-]/g, '').slice(0, 20);
            });
        }

        // Modal Elements
        const statusModal = document.getElementById('statusModal');
        const modalStepConfirm = document.getElementById('modalStepConfirm');
        const modalStepSelect = document.getElementById('modalStepSelect');
        const studentNameText = document.getElementById('studentNameText');
        const studentNameSelectText = document.getElementById('studentNameSelectText');
        const btnConfirmNo = document.getElementById('btnConfirmNo');
        const btnConfirmYes = document.getElementById('btnConfirmYes');
        const btnCancelSelect = document.getElementById('btnCancelSelect');
        const btnSaveStatus = document.getElementById('btnSaveStatus');
        const addStudentsModal = document.getElementById('addStudentsModal');
        const btnCloseAddStudents = document.getElementById('btnCloseAddStudents');
        const btnCancelAddStudents = document.getElementById('btnCancelAddStudents');
        const asCourseCodeSelect = document.getElementById('asCourseCodeSelect');
        const asSectionSelect = document.getElementById('asSectionSelect');
        const asTermSelect = document.getElementById('asTermSelect');
        const asSchoolYear = document.getElementById('asSchoolYear');
        const asStudentSearch = document.getElementById('asStudentSearch');
        const asSearchResults = document.getElementById('asSearchResults');
        const asShowNewStudentForm = document.getElementById('asShowNewStudentForm');
        const newStudentModal = document.getElementById('newStudentModal');
        const btnCloseNewStudent = document.getElementById('btnCloseNewStudent');
        const asAddNewStudentBtn = document.getElementById('asAddNewStudentBtn');
        const asCancelNewStudentBtn = document.getElementById('asCancelNewStudentBtn');
        const newStudentForm = document.getElementById('newStudentForm');
        const asSelectedList = document.getElementById('asSelectedList');
        const asStudentFile = document.getElementById('asStudentFile');
        const btnSubmitAddStudents = document.getElementById('btnSubmitAddStudents');
        const selectedStudents = [];
        let availableCourses = Array.isArray(window.studentCourseOptions) ? window.studentCourseOptions : [];

        let activeRow = null;

        function populateCourseOptions(courses) {
            availableCourses = courses;
            const courseCodes = [...new Set(availableCourses.map((course) => course.courseCode))];

            if (asCourseCodeSelect) {
                asCourseCodeSelect.innerHTML = '<option value="">Select course code...</option>';
                courseCodes.forEach((courseCode) => {
                    const option = document.createElement('option');
                    option.value = courseCode;
                    option.textContent = courseCode;
                    asCourseCodeSelect.appendChild(option);
                });
            }

            if (filterCourse) {
                filterCourse.innerHTML = '<option value="ALL">All Course Codes</option>';
                courseCodes.forEach((courseCode) => {
                    const option = document.createElement('option');
                    option.value = courseCode;
                    option.textContent = courseCode;
                    filterCourse.appendChild(option);
                });
            }

            if (filterSection) {
                const sections = [...new Set(availableCourses.map((course) => course.section))];
                filterSection.innerHTML = '<option value="ALL">All Sections</option>';
                sections.forEach((section) => {
                    const option = document.createElement('option');
                    option.value = section;
                    option.textContent = section;
                    filterSection.appendChild(option);
                });
            }
        }

        async function loadCourseOptions() {
            const response = await fetch('/students/api/form-options');
            const responseText = await response.text();
            let options = {};

            try {
                options = responseText ? JSON.parse(responseText) : {};
            } catch {
                throw new Error(`Form options request failed with HTTP ${response.status}. Restart the server and try again.`);
            }

            if (!response.ok) throw new Error(options.error || 'Unable to load form options.');

            const fetchedCourses = Array.isArray(options.courses) ? options.courses : [];
            populateCourseOptions(fetchedCourses.length ? fetchedCourses : availableCourses);

            if (asSectionSelect) {
                asSectionSelect.innerHTML = '<option value="">Select section...</option>';
                asSectionSelect.disabled = true;
            }

            if (asTermSelect) {
                asTermSelect.innerHTML = '<option value="">Select term...</option>';
            }
            if (asSchoolYear) {
                asSchoolYear.innerHTML = '<option value="">Select school year...</option>';
                asSchoolYear.disabled = true;
            }
        }

        async function openAddStudentModal() {
            if (!addStudentsModal) return;

            addStudentsModal.style.display = 'flex';
            addStudentsModal.setAttribute('aria-hidden', 'false');

            try {
                await loadCourseOptions();
            } catch (error) {
                window.alert(error.message);
            }
        }

        loadCourseOptions().catch((error) => {
            console.error('Unable to load course options:', error);
        });

        asCourseCodeSelect?.addEventListener('change', () => {
            const sections = availableCourses
                .filter((course) => course.courseCode === asCourseCodeSelect.value)
                .map((course) => course.section);
            asSectionSelect.innerHTML = '<option value="">Select section...</option>';
            [...new Set(sections)].forEach((section) => {
                const option = document.createElement('option');
                option.value = section;
                option.textContent = section;
                asSectionSelect.appendChild(option);
            });
            asSectionSelect.disabled = sections.length === 0;
            asTermSelect.innerHTML = '<option value="">Select term...</option>';
            asTermSelect.disabled = true;
            asSchoolYear.innerHTML = '<option value="">Select school year...</option>';
            asSchoolYear.disabled = true;
        });

        asSectionSelect?.addEventListener('change', () => {
            const selectedCourse = availableCourses.find((course) =>
                course.courseCode === asCourseCodeSelect.value && course.section === asSectionSelect.value
            );
            const offerings = selectedCourse?.offerings || [];
            const years = [...new Set(offerings.map((offering) => offering.schoolYear))];
            asSchoolYear.innerHTML = '<option value="">Select school year...</option>';
            years.forEach((year) => {
                const option = document.createElement('option');
                option.value = year;
                option.textContent = year;
                asSchoolYear.appendChild(option);
            });
            asSchoolYear.disabled = years.length === 0;
            asTermSelect.innerHTML = '<option value="">Select term...</option>';
            asTermSelect.disabled = true;
        });

        asSchoolYear?.addEventListener('change', () => {
            const selectedCourse = availableCourses.find((course) =>
                course.courseCode === asCourseCodeSelect.value && course.section === asSectionSelect.value
            );
            const years = (selectedCourse?.offerings || [])
                .filter((offering) => offering.schoolYear === asSchoolYear.value)
                .map((offering) => offering.term);
            asTermSelect.innerHTML = '<option value="">Select term...</option>';
            [...new Set(years)].forEach((term) => {
                const option = document.createElement('option');
                option.value = term;
                option.textContent = term;
                asTermSelect.appendChild(option);
            });
            asTermSelect.disabled = years.length === 0;
        });

        filterCourse?.addEventListener('change', () => {
            const matchingCourses = filterCourse.value === 'ALL'
                ? availableCourses
                : availableCourses.filter((course) => course.courseCode === filterCourse.value);
            const sections = [...new Set(matchingCourses.map((course) => course.section))];
            filterSection.innerHTML = '<option value="ALL">All Sections</option>';
            sections.forEach((section) => {
                const option = document.createElement('option');
                option.value = section;
                option.textContent = section;
                filterSection.appendChild(option);
            });
            filterSection.value = 'ALL';
        });

        function resetAddStudentForm() {
            selectedStudents.length = 0;
            renderSelectedStudents();
            asCourseCodeSelect.value = '';
            asSectionSelect.innerHTML = '<option value="">Select section...</option>';
            asSectionSelect.disabled = true;
            asTermSelect.value = '';
            asTermSelect.disabled = true;
            asSchoolYear.value = '';
            asSchoolYear.innerHTML = '<option value="">Select school year...</option>';
            asSchoolYear.disabled = true;
            asStudentSearch.value = '';
            asSearchResults.innerHTML = '';
            asSearchResults.style.display = 'none';
            resetNewStudentForm();
        }

        function closeAddStudentModal() {
            if (!addStudentsModal) return;
            addStudentsModal.style.display = 'none';
            addStudentsModal.setAttribute('aria-hidden', 'true');
            resetAddStudentForm();
        }

        function renderSelectedStudents() {
            if (!asSelectedList) return;
            asSelectedList.innerHTML = selectedStudents.length
                ? selectedStudents.map((student, index) => `
                    <div class="as-selected-student">
                        <span>${student.firstName} ${student.surname} (${student.studentId})</span>
                        <button type="button" data-index="${index}" class="as-remove-student" aria-label="Remove student">&times;</button>
                    </div>`).join('')
                : '<p class="as-empty-hint">No students added yet.</p>';
        }

        function addStudentToSelection(student) {
            const studentId = String(student.studentId || '').trim();
            if (!studentId || selectedStudents.some((item) => item.studentId === studentId)) {
                window.alert('This student is already on the list.');
                return;
            }
            selectedStudents.push({...student, studentId});
            renderSelectedStudents();
            asStudentSearch.value = '';
            asSearchResults.style.display = 'none';
        }

        asStudentFile?.addEventListener('change', async () => {
            if (!asStudentFile.files[0]) return;
            try {
                const formData = new FormData();
                formData.append('file', asStudentFile.files[0]);
                const response = await fetch('/courses/api/parse-students', { method: 'POST', body: formData });
                const result = await response.json().catch(() => ({}));
                if (!response.ok) throw new Error(result.error || 'Unable to read the student file.');
                (result.students || []).forEach(addStudentToSelection);
            } catch (error) {
                window.alert(error.message);
            } finally {
                asStudentFile.value = '';
            }
        });

        asSelectedList?.addEventListener('click', (event) => {
            const removeButton = event.target.closest('.as-remove-student');
            if (!removeButton) return;
            selectedStudents.splice(Number(removeButton.dataset.index), 1);
            renderSelectedStudents();
        });

        asShowNewStudentForm?.addEventListener('click', () => {
            newStudentModal.style.display = 'flex';
            newStudentModal.setAttribute('aria-hidden', 'false');
        });

        function resetNewStudentForm() {
            ['asNewStudentId', 'asNewSurname', 'asNewFirstName', 'asNewMiddleName'].forEach((id) => {
                document.getElementById(id).value = '';
            });
            document.getElementById('asNewProgram').value = '';
        }

        function closeNewStudentModal() {
            newStudentModal.style.display = 'none';
            newStudentModal.setAttribute('aria-hidden', 'true');
            resetNewStudentForm();
        }

        btnCloseNewStudent?.addEventListener('click', closeNewStudentModal);
        asCancelNewStudentBtn?.addEventListener('click', closeNewStudentModal);

        newStudentForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            const student = {
                studentId: document.getElementById('asNewStudentId').value,
                firstName: document.getElementById('asNewFirstName').value.trim(),
                surname: document.getElementById('asNewSurname').value.trim(),
                middleName: document.getElementById('asNewMiddleName').value.trim(),
                program: document.getElementById('asNewProgram').value
            };
            if (!/^[A-Za-z0-9-]{1,20}$/.test(student.studentId) || !student.firstName || !student.surname || !student.program) {
                window.alert('Student ID, first name, last name, and program are required.');
                return;
            }
            addStudentToSelection(student);
            closeNewStudentModal();
        });

        asStudentSearch?.addEventListener('input', async () => {
            const query = asStudentSearch.value.trim();
            if (!query) {
                asSearchResults.style.display = 'none';
                return;
            }

            const response = await fetch(`/students/api/search?q=${encodeURIComponent(query)}`);
            const result = await response.json();
            asSearchResults.innerHTML = (result.students || []).map((student) => `
                <button type="button" class="as-search-result" data-student='${JSON.stringify(student)}'>
                    ${student.firstName} ${student.surname} (${student.studentId})
                </button>`).join('');
            asSearchResults.style.display = result.students?.length ? 'block' : 'none';
        });

        asSearchResults?.addEventListener('click', (event) => {
            const resultButton = event.target.closest('.as-search-result');
            if (resultButton) addStudentToSelection(JSON.parse(resultButton.dataset.student));
        });

        btnSubmitAddStudents?.addEventListener('click', async () => {
            const selectedCourse = availableCourses.find((course) =>
                course.courseCode === asCourseCodeSelect.value && course.section === asSectionSelect.value
            );
            if (!selectedCourse || !asTermSelect.value || !/^\d{4}-\d{4}$/.test(asSchoolYear.value.trim())) {
                window.alert('Select a course, term, and valid school year first.');
                return;
            }
            if (!selectedStudents.length) {
                window.alert('Add at least one student first.');
                return;
            }

            const submitStudents = (confirmExisting = false) => fetch('/students/api/add-to-roster', {
                method: 'POST',
                headers: {'Content-Type': 'application/json'},
                body: JSON.stringify({
                    courseId: selectedCourse._id,
                    term: asTermSelect.value,
                    schoolYear: asSchoolYear.value.trim(),
                    students: selectedStudents,
                    confirmExisting
                })
            });
            let response = await submitStudents();
            let result = await response.json().catch(() => ({}));
            if (response.status === 409 && result.requiresConfirmation) {
                const existing = result.existingStudents.map((student) => `${student.firstName} ${student.surname} (${student.studentId})`).join(', ');
                if (!window.confirm(`These students already exist: ${existing}. Add them together with the new students?`)) return;
                response = await submitStudents(true);
                result = await response.json().catch(() => ({}));
            }
            if (!response.ok) {
                window.alert(result.error || 'Unable to add students right now.');
                return;
            }
            window.location.reload();
        });

        // ==========================================
        // 1. FILTER DROPDOWN TOGGLE & ACTIONS
        // ==========================================
        if (filterBtn && filterDropdown) {
            filterBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                const isVisible = filterDropdown.classList.contains('is-open');
                filterDropdown.classList.toggle('is-open', !isVisible);
                filterBtn.setAttribute('aria-expanded', !isVisible);
            });

            if (btnCloseFilter) {
                btnCloseFilter.addEventListener('click', () => {
                    filterDropdown.classList.remove('is-open');
                    filterBtn.setAttribute('aria-expanded', 'false');
                });
            }

            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!filterDropdown.contains(e.target) && !filterBtn.contains(e.target)) {
                    filterDropdown.classList.remove('is-open');
                    filterBtn.setAttribute('aria-expanded', 'false');
                }
            });
        }

        // Apply Filter logic
        if (btnApplyFilter) {
            btnApplyFilter.addEventListener('click', () => {
                applyFilters();
                filterDropdown.classList.remove('is-open');
                filterBtn.setAttribute('aria-expanded', 'false');
            });
        }

        // Reset Filter logic
        if (btnResetFilter) {
            btnResetFilter.addEventListener('click', () => {
                if (filterProgram) filterProgram.value = 'ALL';
                if (filterCourse) filterCourse.value = 'ALL';
                if (filterSection) filterSection.value = 'ALL';
                if (filterActiveBadge) filterActiveBadge.style.display = 'none';
                applyFilters();
            });
        }

        // ==========================================
        // 2. ADD STUDENTS BUTTON
        // ==========================================
        if (addStudentBtn) {
            addStudentBtn.addEventListener('click', openAddStudentModal);
        }
        if (btnCloseAddStudents) btnCloseAddStudents.addEventListener('click', closeAddStudentModal);
        if (btnCancelAddStudents) btnCancelAddStudents.addEventListener('click', closeAddStudentModal);

        // ==========================================
        // 3. TABLE CLICK HANDLER (STATUS BADGE MODAL)
        // ==========================================
        if (tableBody) {
            tableBody.addEventListener('click', (e) => {
                const badge = e.target.closest('.status-badge');
                if (!badge) return;

                activeRow = badge.closest('tr');
                if (!activeRow || activeRow.id === 'noResultsRow') return;

                const firstName = activeRow.getAttribute('data-firstname') || '';
                const surname = activeRow.getAttribute('data-surname') || '';
                const fullName = `${firstName} ${surname}`.trim();

                studentNameText.textContent = fullName;
                studentNameSelectText.textContent = fullName;

                // Reset modal steps
                modalStepConfirm.style.display = 'block';
                modalStepSelect.style.display = 'none';
                statusModal.style.display = 'flex';
                statusModal.setAttribute('aria-hidden', 'false');
            });
        }

        // Modal Close Logic
        const closeModal = () => {
            statusModal.style.display = 'none';
            statusModal.setAttribute('aria-hidden', 'true');
            activeRow = null;
        };

        if (btnConfirmNo) btnConfirmNo.addEventListener('click', closeModal);
        if (btnCancelSelect) btnCancelSelect.addEventListener('click', closeModal);

        if (btnConfirmYes) {
            btnConfirmYes.addEventListener('click', () => {
                modalStepConfirm.style.display = 'none';
                modalStepSelect.style.display = 'block';

                if (activeRow) {
                    const currentBadge = activeRow.querySelector('.status-badge');
                    const currentStatus = currentBadge ? currentBadge.textContent.trim() : 'P';
                    const radioToSelect = document.querySelector(`input[name="statusOption"][value="${currentStatus}"]`);
                    if (radioToSelect) radioToSelect.checked = true;
                }
            });
        }

        if (btnSaveStatus) {
            btnSaveStatus.addEventListener('click', async () => {
                const selectedRadio = document.querySelector('input[name="statusOption"]:checked');
                if (selectedRadio && activeRow) {
                    const newStatus = selectedRadio.value;
                    const examRecordId = activeRow.dataset.examrecordid;
                    const studentId = activeRow.dataset.studentobjectid;

                    try {
                        const response = await fetch(`/courses/api/${examRecordId}/roster/${studentId}`, {
                            method: 'PATCH',
                            headers: {'Content-Type': 'application/json'},
                            body: JSON.stringify({status: newStatus})
                        });
                        const result = await response.json().catch(() => ({}));
                        if (!response.ok) {
                            throw new Error(result.error || 'Unable to update roster status.');
                        }

                        const badgeSpan = activeRow.querySelector('.status-badge');
                        if (badgeSpan) {
                            badgeSpan.textContent = newStatus;
                            badgeSpan.className = `status-badge ${newStatus === 'P' ? 'passed' : 'completion'}`;
                        }
                        closeModal();
                    } catch (error) {
                        window.alert(error.message);
                    }
                }
            });
        }

        // ==========================================
        // 4. REAL-TIME SEARCH & FILTER FUNCTION
        // ==========================================
        function applyFilters() {
            const query = studentSearch ? studentSearch.value.toLowerCase().trim() : '';
            const programVal = filterProgram ? filterProgram.value : 'ALL';
            const courseVal = filterCourse ? filterCourse.value : 'ALL';
            const sectionVal = filterSection ? filterSection.value : 'ALL';

            const rows = tableBody.querySelectorAll('tr:not(#noResultsRow)');
            let visibleCount = 0;

            const isFiltered = programVal !== 'ALL' || courseVal !== 'ALL' || sectionVal !== 'ALL';
            if (filterActiveBadge) {
                filterActiveBadge.style.display = isFiltered ? 'inline-block' : 'none';
            }

            rows.forEach((row) => {
                const surname = (row.getAttribute('data-surname') || '').toLowerCase();
                const firstname = (row.getAttribute('data-firstname') || '').toLowerCase();
                const studentid = (row.getAttribute('data-studentid') || '').toLowerCase();
                const program = row.getAttribute('data-program') || '';
                const course = row.getAttribute('data-course') || '';
                const section = row.getAttribute('data-section') || '';

                const matchesSearch = !query || surname.includes(query) || firstname.includes(query) || studentid.includes(query);
                const matchesProgram = programVal === 'ALL' || program === programVal;
                const matchesCourse = courseVal === 'ALL' || course === courseVal;
                const matchesSection = sectionVal === 'ALL' || section === sectionVal;

                if (matchesSearch && matchesProgram && matchesCourse && matchesSection) {
                    row.style.display = '';
                    visibleCount++;
                } else {
                    row.style.display = 'none';
                }
            });

            if (noResultsRow) {
                noResultsRow.style.display = visibleCount === 0 ? '' : 'none';
            }
        }

        if (studentSearch) {
            studentSearch.addEventListener('input', applyFilters);
        }

        function toggleFilterDropdown(event) {
            if (event) event.stopPropagation();
            const filterDropdown = document.getElementById('filterDropdown');
            if (!filterDropdown) return;
            
            const isHidden = !filterDropdown.classList.contains('is-open');
            filterDropdown.classList.toggle('is-open', isHidden);
        }
    });