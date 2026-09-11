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

    let activeRow = null;

    // ==========================================
    // 1. FILTER DROPDOWN TOGGLE & ACTIONS
    // ==========================================
    if (filterBtn && filterDropdown) {
        filterBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const isVisible = filterDropdown.style.display === 'block';
            filterDropdown.style.display = isVisible ? 'none' : 'block';
            filterBtn.setAttribute('aria-expanded', !isVisible);
        });

        if (btnCloseFilter) {
            btnCloseFilter.addEventListener('click', () => {
                filterDropdown.style.display = 'none';
                filterBtn.setAttribute('aria-expanded', 'false');
            });
        }

        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!filterDropdown.contains(e.target) && !filterBtn.contains(e.target)) {
                filterDropdown.style.display = 'none';
                filterBtn.setAttribute('aria-expanded', 'false');
            }
        });
    }

    // Apply Filter logic
    if (btnApplyFilter) {
        btnApplyFilter.addEventListener('click', () => {
            applyFilters();
            filterDropdown.style.display = 'none';
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
        addStudentBtn.addEventListener('click', () => {
            // Target route for adding students
            window.location.href = '/students/add';
        });
    }

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
        btnSaveStatus.addEventListener('click', () => {
            const selectedRadio = document.querySelector('input[name="statusOption"]:checked');
            if (selectedRadio && activeRow) {
                const newStatus = selectedRadio.value;
                const badgeSpan = activeRow.querySelector('.status-badge');

                if (badgeSpan) {
                    badgeSpan.textContent = newStatus;
                    badgeSpan.className = `status-badge ${newStatus === 'P' ? 'passed' : 'completion'}`;
                }
            }
            closeModal();
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
        
        const isHidden = filterDropdown.style.display === 'none' || filterDropdown.style.display === '';
        filterDropdown.style.display = isHidden ? 'block' : 'none';
    }
});