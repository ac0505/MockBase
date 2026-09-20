document.addEventListener("DOMContentLoaded", () => {
    // ── Tab Navigation ──
    const tabs = document.querySelectorAll(".tab-btn");
    const panels = document.querySelectorAll(".tab-panel");

    tabs.forEach(tab => {
        tab.addEventListener("click", () => {
            tabs.forEach(t => t.classList.remove("active"));
            panels.forEach(p => p.classList.remove("active"));
            
            tab.classList.add("active");
            document.getElementById(`tab-${tab.dataset.tab}`).classList.add("active");
            
            // Lazy load tab data
            if (tab.dataset.tab === "users") loadUsers();
            if (tab.dataset.tab === "terms") loadTerms();
            if (tab.dataset.tab === "audit") loadAuditLogs();
            if (tab.dataset.tab === "overrides") loadLockedRecords();
        });
    });

    // ── Globals ──
    window.closeModal = (id) => {
        document.getElementById(id).classList.remove("active");
    };

    function openModal(id) {
        document.getElementById(id).classList.add("active");
    }

    // ── Users Management ──
    const usersTableBody = document.querySelector("#usersTable tbody");
    const userForm = document.getElementById("userForm");
    
    document.getElementById("btnNewUser").addEventListener("click", () => {
        userForm.reset();
        document.getElementById("userId").value = "";
        document.getElementById("username").readOnly = false;
        document.getElementById("userModalTitle").textContent = "New User";
        document.getElementById("password").required = true;
        document.getElementById("userAlert").className = "alert";
        openModal("userModal");
    });

    async function loadUsers() {
        try {
            const res = await fetch("/admin/api/users");
            const data = await res.json();
            
            if (data.users.length === 0) {
                usersTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center;">No users found.</td></tr>`;
                return;
            }

            usersTableBody.innerHTML = data.users.map(u => `
                <tr>
                    <td><strong>${u.firstName} ${u.lastName}</strong></td>
                    <td>${u.username}</td>
                    <td><span class="admin-role-badge ${u.role === 'admin' ? 'admin' : 'faculty'}">${u.role === 'admin' ? 'ADMIN' : 'FACULTY'}</span></td>
                    <td>${u.department || '-'}</td>
                    <td>
                        <span class="admin-status-badge ${u.isActive ? 'active' : 'inactive'}"><span></span>${u.isActive ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td class="admin-actions-cell">
                        <label class="admin-switch" title="Toggle active for ${u.username}">
                            <input type="checkbox" ${u.isActive ? 'checked' : ''} onchange="toggleUserStatus('${u._id}', this.checked)">
                            <span class="admin-switch-track"></span>
                        </label>
                        <button class="action-btn" onclick="editUser('${u._id}')" title="Edit user" aria-label="Edit user">
                            <span class="material-symbols-outlined">edit</span>
                        </button>
                        <button class="action-btn" onclick="resetUserPassword('${u._id}')" title="Reset password" aria-label="Reset password">
                            <span class="material-symbols-outlined">key</span>
                        </button>
                    </td>
                </tr>
            `).join("");
        } catch (error) {
            usersTableBody.innerHTML = `<tr><td colspan="6" style="text-align:center; color: red;">Failed to load users.</td></tr>`;
        }
    }

    window.editUser = async (id) => {
        try {
            const res = await fetch("/admin/api/users");
            const data = await res.json();
            const user = data.users.find(u => u._id === id);
            if (!user) return;

            document.getElementById("userId").value = user._id;
            document.getElementById("firstName").value = user.firstName;
            document.getElementById("lastName").value = user.lastName;
            document.getElementById("email").value = user.email;
            document.getElementById("username").value = user.username;
            document.getElementById("username").readOnly = true; // Don't allow changing username
            document.getElementById("role").value = user.role;
            document.getElementById("isActive").value = user.isActive.toString();
            document.getElementById("department").value = user.department || "";
            document.getElementById("password").required = false;
            document.getElementById("userModalTitle").textContent = "Edit User";
            document.getElementById("userAlert").className = "alert";

            openModal("userModal");
        } catch (error) {
            alert("Error loading user details.");
        }
    };

    window.deleteUser = async (id) => {
        if (!confirm("Are you sure you want to delete this user?")) return;
        try {
            const res = await fetch(`/admin/api/users/${id}`, { method: "DELETE" });
            const data = await res.json();
            if (res.ok) {
                loadUsers();
            } else {
                alert(data.error);
            }
        } catch (error) {
            alert("Network error.");
        }
    };

    window.toggleUserStatus = async (id, isActive) => {
        try {
            const res = await fetch(`/admin/api/users/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive })
            });
            if (!res.ok) throw new Error("Unable to update account status.");
            loadUsers();
        } catch (error) {
            alert(error.message);
            loadUsers();
        }
    };

    window.resetUserPassword = async (id) => {
        const password = prompt("Enter a new password (at least 6 characters):");
        if (!password) return;
        try {
            const res = await fetch(`/admin/api/users/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ password })
            });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error || "Unable to reset password.");
            alert("Password reset successfully.");
        } catch (error) {
            alert(error.message);
        }
    };

    userForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const id = document.getElementById("userId").value;
        const url = id ? `/admin/api/users/${id}` : `/admin/api/users`;
        const method = id ? "PATCH" : "POST";
        
        const payload = Object.fromEntries(new FormData(userForm));
        if (!payload.password) delete payload.password;
        payload.isActive = payload.isActive === "true";

        try {
            const res = await fetch(url, {
                method,
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (res.ok) {
                closeModal("userModal");
                loadUsers();
            } else {
                const alert = document.getElementById("userAlert");
                alert.className = "alert alert-error show";
                alert.textContent = data.error;
            }
        } catch (error) {
            alert("Network error.");
        }
    });

    // ── Terms Management ──
    const termsTableBody = document.querySelector("#termsTable tbody");
    const termForm = document.getElementById("termForm");

    document.getElementById("btnNewTerm").addEventListener("click", () => {
        termForm.reset();
        document.getElementById("termAlert").className = "alert";
        openModal("termModal");
    });

    async function loadTerms() {
        try {
            const res = await fetch("/admin/api/terms");
            const data = await res.json();
            
            if (data.terms.length === 0) {
                termsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center;">No term configs found.</td></tr>`;
                return;
            }

            termsTableBody.innerHTML = data.terms.map(t => `
                <tr>
                    <td><strong>${t.schoolYear}</strong></td>
                    <td>${t.term}</td>
                    <td>
                        <button class="badge ${t.isActive ? 'badge-green' : 'badge-blue'}" onclick="toggleTerm('${t._id}', ${!t.isActive})" style="border:none; cursor:pointer;">
                            ${t.isActive ? 'Active' : 'Inactive'}
                        </button>
                    </td>
                    <td>${t.createdBy?.username || '-'}</td>
                    <td>
                        <button class="action-btn delete" onclick="deleteTerm('${t._id}')" title="Delete">
                            <span class="material-symbols-outlined" style="font-size: 1.25rem;">delete</span>
                        </button>
                    </td>
                </tr>
            `).join("");
        } catch (error) {
            termsTableBody.innerHTML = `<tr><td colspan="5" style="text-align:center; color: red;">Failed to load terms.</td></tr>`;
        }
    }

    termForm.addEventListener("submit", async (e) => {
        e.preventDefault();
        const payload = Object.fromEntries(new FormData(termForm));
        
        try {
            const res = await fetch("/admin/api/terms", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(payload)
            });
            const data = await res.json();
            
            if (res.ok) {
                closeModal("termModal");
                loadTerms();
            } else {
                const alert = document.getElementById("termAlert");
                alert.className = "alert alert-error show";
                alert.textContent = data.error;
            }
        } catch (error) {
            alert("Network error.");
        }
    });

    window.toggleTerm = async (id, isActive) => {
        try {
            const res = await fetch(`/admin/api/terms/${id}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ isActive })
            });
            if (res.ok) loadTerms();
        } catch (error) {
            alert("Error updating term.");
        }
    };

    window.deleteTerm = async (id) => {
        if (!confirm("Are you sure you want to delete this term config?")) return;
        try {
            const res = await fetch(`/admin/api/terms/${id}`, { method: "DELETE" });
            if (res.ok) loadTerms();
        } catch (error) {
            alert("Error deleting term.");
        }
    };

    // ── Audit Logs ──
    const auditTableBody = document.querySelector("#auditTable tbody");
    document.getElementById("btnRefreshAudit").addEventListener("click", loadAuditLogs);

    async function loadAuditLogs() {
        try {
            const res = await fetch("/admin/api/audit-logs?limit=50");
            const data = await res.json();
            
            if (data.logs.length === 0) {
                auditTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center;">No audit logs found.</td></tr>`;
                return;
            }

            auditTableBody.innerHTML = data.logs.map(log => {
                const date = new Date(log.createdAt).toLocaleString();
                return `
                <tr>
                    <td>${date}</td>
                    <td><span class="badge badge-yellow">${log.action}</span></td>
                    <td>${log.performedBy?.username || '-'}</td>
                    <td>${log.details}</td>
                </tr>
            `}).join("");
        } catch (error) {
            auditTableBody.innerHTML = `<tr><td colspan="4" style="text-align:center; color: red;">Failed to load audit logs.</td></tr>`;
        }
    }

    // ── Overrides (Unlock & Merge) ──
    const lockedExamSelect = document.getElementById("lockedExamSelect");
    
    async function loadLockedRecords() {
        try {
            const res = await fetch("/admin/api/exam-records");
            const data = await res.json();
            
            const locked = data.records.filter(r => r.isLocked);
            if (locked.length === 0) {
                lockedExamSelect.innerHTML = `<option value="">No locked records found.</option>`;
            } else {
                lockedExamSelect.innerHTML = `<option value="">Select a record to unlock</option>` + 
                    locked.map(r => `<option value="${r._id}">${r.courseCode} - ${r.term} ${r.schoolYear}</option>`).join("");
            }
        } catch (error) {
            lockedExamSelect.innerHTML = `<option value="">Failed to load records.</option>`;
        }
    }

    document.getElementById("btnUnlock").addEventListener("click", async () => {
        const id = lockedExamSelect.value;
        if (!id) return alert("Select a record first.");
        
        if (!confirm("Are you sure you want to unlock this record? It will allow faculty to modify it again.")) return;
        
        try {
            const res = await fetch(`/admin/api/unlock-record/${id}`, { method: "POST" });
            const data = await res.json();
            if (res.ok) {
                alert("Record unlocked successfully.");
                loadLockedRecords();
            } else {
                alert(data.error);
            }
        } catch (error) {
            alert("Network error.");
        }
    });

    document.getElementById("btnMerge").addEventListener("click", async () => {
        const keepId = document.getElementById("mergeKeepId").value.trim();
        const mergeId = document.getElementById("mergeDeleteId").value.trim();
        
        if (!keepId || !mergeId) return alert("Both student IDs (Object IDs) are required.");
        
        if (!confirm("WARNING: This will permanently delete the duplicate student and migrate all their exam records to the primary student. This action cannot be undone. Proceed?")) return;
        
        try {
            const res = await fetch("/admin/api/merge-students", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ keepId, mergeId })
            });
            const data = await res.json();
            
            if (res.ok) {
                alert(data.message);
                document.getElementById("mergeKeepId").value = "";
                document.getElementById("mergeDeleteId").value = "";
            } else {
                alert(data.error);
            }
        } catch (error) {
            alert("Network error.");
        }
    });

    // Initial load
    loadUsers();
});
