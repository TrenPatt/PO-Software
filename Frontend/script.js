document.addEventListener('DOMContentLoaded', async () => {
    await loadHeader();

    const isLoginPage = window.location.pathname.endsWith('index.html') || window.location.pathname === '/';
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        bindLoginForm(loginForm);
        try {
            const user = await fetchCurrentUser();
            if (user) {
                window.location.href = '/dashboard.html';
            }
        } catch (error) {
            // Not authenticated, keep on login page.
        }
        return;
    }

    try {
        const user = await fetchCurrentUser();
        configureAuthenticatedNav(user);
        if (document.getElementById('requestTableBody')) {
            initViewRequests(user);
        }
        if (document.getElementById('dashboardWelcome')) {
            renderDashboard(user);
        }
        if (document.getElementById('userTableBody')) {
            initUserManagement();
        }
        if (document.getElementById('purchaseRequestForm')) {
            initPurchaseRequestForm();
        }
    } catch (error) {
        window.location.href = '/index.html';
    }
});

async function loadHeader() {
    const header = document.getElementById('header');
    if (!header) return;

    try {
        const response = await fetch('header.html');
        const html = await response.text();
        header.innerHTML = html;

        const logoutButton = document.getElementById('logoutButton');
        if (logoutButton) {
            logoutButton.addEventListener('click', async () => {
                try {
                    await apiRequest('/api/auth/logout', { method: 'POST' });
                    window.location.href = '/index.html';
                } catch (error) {
                    window.location.href = '/index.html';
                }
            });
        }
    } catch (error) {
        console.error('Failed to load header:', error);
    }
}

function getCookie(name) {
    const raw = document.cookie.split('; ').find((entry) => entry.startsWith(`${name}=`));
    if (!raw) return '';
    return decodeURIComponent(raw.split('=')[1]);
}

function readCsrfToken() {
    return getCookie('csrf_token');
}

async function apiRequest(url, options = {}) {
    const method = options.method || 'GET';
    const headers = { ...(options.headers || {}) };
    const body = options.body;

    if (body && typeof body === 'object' && !(body instanceof FormData)) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(body);
    }

    if (method !== 'GET' && method !== 'HEAD') {
        const csrfToken = readCsrfToken();
        if (csrfToken) {
            headers['X-CSRF-Token'] = csrfToken;
        }
    }

    const response = await fetch(url, {
        ...options,
        credentials: 'same-origin',
        headers,
    });

    const contentType = response.headers.get('content-type') || '';
    let payload = null;
    if (contentType.includes('application/json')) {
        payload = await response.json();
    } else {
        payload = await response.text();
    }

    if (!response.ok) {
        const message = (payload && payload.error) || 'Request failed.';
        throw new Error(message);
    }

    return payload;
}

async function fetchCurrentUser() {
    const response = await fetch('/api/auth/status', { credentials: 'same-origin' });
    if (!response.ok) {
        throw new Error('Not authenticated');
    }
    const data = await response.json();
    return data.user;
}

function configureAuthenticatedNav(user) {
    const userBadge = document.getElementById('userBadge');
    if (userBadge) {
        userBadge.textContent = `${user.username} (${user.role})`;
    }

    const adminLinks = document.querySelectorAll('.admin-only');
    adminLinks.forEach((element) => {
        element.classList.toggle('hidden', user.role !== 'admin');
    });
    document.querySelectorAll('.requestor-only').forEach(element => {
    element.classList.toggle('hidden', user.role !== 'requestor');
});

document.querySelectorAll('.requests-only').forEach(element => {
    element.classList.toggle(
        'hidden',
        !['requestor', 'approver'].includes(user.role)
    );
});
}

function bindLoginForm(form) {
    form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const message = document.getElementById('loginMessage');
        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value;

        message.textContent = '';
        message.className = 'form-message';

        try {
            await apiRequest('/api/auth/login', {
                method: 'POST',
                body: { username, password },
            });
            window.location.href = '/dashboard.html';
        } catch (error) {
            message.textContent = error.message || 'Login failed.';
            message.classList.add('error');
        }
    });
}

function renderDashboard(user) {
    const title = document.getElementById('dashboardTitle');
    const welcome = document.getElementById('dashboardWelcome');

    if (title) {
        title.textContent = `Welcome, ${user.username}`;
    }
    if (welcome) {
        welcome.textContent = `Signed in as ${user.username} with the ${user.role} role.`;
    }
}

async function initUserManagement() {
    const searchInput = document.getElementById('userSearch');
    const searchButton = document.getElementById('searchUsers');
    const openFormButton = document.getElementById('openUserForm');
    const formPanel = document.getElementById('userFormPanel');
    const userForm = document.getElementById('userForm');
    const userFormMessage = document.getElementById('userFormMessage');

    if (openFormButton && formPanel) {
        openFormButton.addEventListener('click', () => {
            formPanel.classList.toggle('hidden');
        });
    }

    if (searchButton && searchInput) {
        searchButton.addEventListener('click', () => loadUsers(searchInput.value.trim()));
    }

    if (searchInput) {
        searchInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                loadUsers(searchInput.value.trim());
            }
        });
    }

    if (userForm) {
        userForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            userFormMessage.textContent = '';
            userFormMessage.className = 'form-message';

            const username = document.getElementById('newUsername').value.trim();
            const password = document.getElementById('newPassword').value;
            const role = document.getElementById('newRole').value;
            const department = document.getElementById('newDepartment').value.trim();

            try {
                await apiRequest('/api/users/users', {
                    method: 'POST',
                    body: { username, password, role, department },
                });
                userForm.reset();
                userFormMessage.textContent = 'User created successfully.';
                userFormMessage.classList.add('success');
                await loadUsers(searchInput ? searchInput.value.trim() : '');
            } catch (error) {
                userFormMessage.textContent = error.message;
                userFormMessage.classList.add('error');
            }
        });
    }

    await loadUsers('');
}

async function loadUsers(searchValue = '') {
    const tableBody = document.getElementById('userTableBody');

    if (!tableBody) return;

    try {
        const response = await apiRequest(
            `/api/users/users?search=${encodeURIComponent(searchValue)}`
        );

        tableBody.innerHTML = '';

        if (!response.users?.length) {
            tableBody.innerHTML = `
                <tr>
                    <td colspan="6">No users found.</td>
                </tr>
            `;
            return;
        }

        response.users.forEach(user => {

            const row = document.createElement('tr');

            row.innerHTML = `
                <td>${escapeHtml(user.username)}</td>
                <td>${escapeHtml(user.role)}</td>
                <td>${escapeHtml(user.department || '—')}</td>
                <td>${escapeHtml(user.status)}</td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td>
                    <button
                        type="button"
                        class="department-user-button">
                        Set Department
                    </button>

                    <button
                        type="button"
                        class="action-button delete-user-button">
                        Delete
                    </button>
                </td>
            `;

            // Update department
            row.querySelector('.department-user-button')
                .addEventListener('click', async () => {

                    const department = window.prompt(
                        `Department for ${user.username}:`,
                        user.department || ''
                    );

                    if (department === null) return;

                    try {
                        await apiRequest(
                            `/api/users/users/${user.id}/department`,
                            {
                                method: 'PATCH',
                                body: {
                                    department: department.trim()
                                }
                            }
                        );

                        await loadUsers(
                            document.getElementById('userSearch')?.value.trim() || ''
                        );

                    } catch (error) {
                        window.alert(error.message);
                    }
                });

            // Delete user
            row.querySelector('.delete-user-button')
                .addEventListener('click', async () => {

                    const confirmed = window.confirm(
                        `Delete user ${user.username}?`
                    );

                    if (!confirmed) return;

                    try {
                        await apiRequest(
                            `/api/users/users/${user.id}`,
                            { method: 'DELETE' }
                        );

                        await loadUsers(
                            document.getElementById('userSearch')?.value.trim() || ''
                        );

                    } catch (error) {
                        window.alert(error.message);
                    }
                });

            tableBody.appendChild(row);
        });

    } catch (error) {
        tableBody.innerHTML = `
            <tr>
                <td colspan="6">${escapeHtml(error.message)}</td>
            </tr>
        `;
    }
}

function initPurchaseRequestForm() {

    const form = document.getElementById('purchaseRequestForm');

    const quantityInput = document.getElementById('quantity');
    const costInput = document.getElementById('unitCost');
    const totalDisplay = document.getElementById('requestTotal');

    const message = document.getElementById('requestMessage');
    const submitButton = form.querySelector('button[type="submit"]');

    // Calculate estimated total
    function calculateTotal() {

        const quantity = Number(quantityInput.value);
        const cost = Number(costInput.value);

        const total = quantity * cost;

        totalDisplay.textContent =
            Number.isFinite(total)
                ? total.toLocaleString('en-CA', {
                    style: 'currency',
                    currency: 'CAD'
                })
                : '$0.00';
    }

    quantityInput.addEventListener('input', calculateTotal);
    costInput.addEventListener('input', calculateTotal);

    // Submit purchase request
    form.addEventListener('submit', async (event) => {

        event.preventDefault();
        if (submitButton.disabled) return;
            submitButton.disabled = true;

        message.textContent = '';
        message.className = 'form-message';

        const requestData = {
            item_name: document.getElementById('itemName').value.trim(),
            vendor: document.getElementById('vendor').value.trim(),
            quantity: quantityInput.value,
            unit_cost: costInput.value,
            description: document.getElementById('description').value.trim(),
            justification: document.getElementById('justification').value.trim()
        };

        try {

            const response = await apiRequest(
                '/api/purchase-requests',
                {
                    method: 'POST',
                    body: requestData
                }
            );

            message.textContent =
                `Request #${response.requestId} submitted successfully! Status: ${response.status}`;

            message.classList.add('success');

            form.reset();

            calculateTotal();

        } catch (error) {

    message.textContent = error.message;
    message.classList.add('error');

} finally {

    submitButton.disabled = false;

}

    });

}

async function initViewRequests(user) {

    const isRequester = user.role === 'requestor';
    const isApprover = user.role === 'approver';

    const title = document.getElementById('requestsTitle');
    const description = document.getElementById('requestsDescription');
    const tableHead = document.getElementById('requestTableHead');
    const tableBody = document.getElementById('requestTableBody');
    const message = document.getElementById('requestsMessage');

    // Set up the page based on the user's role
    if (isRequester) {

        title.textContent = 'My Purchase Requests';
        description.textContent =
            'Track your requests and their approval statuses.';

    } else if (isApprover) {

        title.textContent = 'Purchase Requests to Review';
        description.textContent =
            'Review requests from your department.';

    } else {

        title.textContent = 'Purchase Requests';
        description.textContent = 'Access denied.';
        return;
    }

    // Refresh button
    document.getElementById('refreshRequests')
        .addEventListener('click', loadRequests);


    // Handle Cancel, Approve, and Deny button clicks
    tableBody.addEventListener('click', async event => {

        const button = event.target.closest(
            'button[data-request-id]'
        );

        if (!button) return;

        const requestId = Number(button.dataset.requestId);

        let url;
        let options;

        // REQUESTER: Cancel a request
        if (
            button.classList.contains('cancel-request-button') &&
            isRequester
        ) {

            const confirmed = window.confirm(
                `Cancel purchase request #${requestId}?`
            );

            if (!confirmed) return;

            url = `/api/purchase-requests/${requestId}/cancel`;

            options = {
                method: 'DELETE'
            };

        }

        // APPROVER: Approve or Deny a request
        else if (
            isApprover &&
            (
                button.classList.contains('approve-request-button') ||
                button.classList.contains('deny-request-button')
            )
        ) {

            const decision =
                button.classList.contains('approve-request-button')
                    ? 'Approved'
                    : 'Denied';

            let comment = '';

            // Ask for an optional reason when denying
            if (decision === 'Denied') {

                const input = window.prompt(
                    'Optional reason for denying this request:',
                    ''
                );

                // User cancelled the prompt
                if (input === null) return;

                comment = input.trim();

                if (comment.length > 1000) {
                    window.alert(
                        'Comment must be 1000 characters or fewer.'
                    );
                    return;
                }
            }

            // Confirm approval or denial
            const confirmed = window.confirm(
                `${decision === 'Approved' ? 'Approve' : 'Deny'} purchase request #${requestId}?`
            );

            if (!confirmed) return;

            url = `/api/purchase-requests/${requestId}/decision`;

            options = {
                method: 'POST',
                body: {
                    decision,
                    comment
                }
            };

        } else {
            return;
        }

        // Prevent repeated clicks while processing
        button.disabled = true;

        try {

            const result = await apiRequest(url, options);

            // Refresh requests after success
            await loadRequests();

            message.textContent = result.message;
            message.className = 'form-message success';

        } catch (error) {

            message.textContent = error.message;
            message.className = 'form-message error';

            button.disabled = false;
        }
    });


    // Load requests when the page first opens
    await loadRequests();


    // Retrieve and display requests
    async function loadRequests() {

        message.textContent = '';
        message.className = 'form-message';

        // Configure table headers by user role
        tableHead.innerHTML = isRequester ? `
            <tr>
                <th>ID</th>
                <th>Item</th>
                <th>Vendor</th>
                <th>Quantity</th>
                <th>Unit Cost</th>
                <th>Total</th>
                <th>Status</th>
                <th>Decision Comment</th>
                <th>Submitted</th>
                <th>Action</th>
            </tr>
        ` : `
            <tr>
                <th>ID</th>
                <th>Requester</th>
                <th>Item</th>
                <th>Vendor</th>
                <th>Quantity</th>
                <th>Total</th>
                <th>Justification</th>
                <th>Status</th>
                <th>Decision Comment</th>
                <th>Submitted</th>
                <th>Action</th>
            </tr>
        `;

        tableBody.innerHTML = '';

        try {

            const response = await apiRequest(
                '/api/purchase-requests'
            );

            // Handle empty request list
            if (!response.requests.length) {

                tableBody.innerHTML = `
                    <tr>
                        <td colspan="${isRequester ? 10 : 11}">
                            No purchase requests found.
                        </td>
                    </tr>
                `;

                return;
            }

            response.requests.forEach(request => {

                const row = document.createElement('tr');

                // Calculate estimated total
                const total =
                    Number(request.quantity) *
                    Number(request.unit_cost);

                // Format submission date
                const submitted = new Date(
                    request.submitted_at.replace(' ', 'T') + 'Z'
                ).toLocaleString();

                // Display cancellation separately
                const displayStatus = request.cancelled_at
                    ? 'Cancelled'
                    : request.status;

                const status = `
                    <span class="status-pill status-${displayStatus.toLowerCase()}">
                        ${escapeHtml(displayStatus)}
                    </span>
                `;

                // Show optional decision comment
                const comment = escapeHtml(
                    request.decision_comment || '—'
                );


                // REQUESTER VIEW
                if (isRequester) {

                    row.innerHTML = `
                        <td>#${request.id}</td>
                        <td>${escapeHtml(request.item_name)}</td>
                        <td>${escapeHtml(request.vendor)}</td>
                        <td>${request.quantity}</td>
                        <td>$${Number(request.unit_cost).toFixed(2)}</td>
                        <td>$${total.toFixed(2)}</td>
                        <td>${status}</td>
                        <td>${comment}</td>
                        <td>${submitted}</td>

                        <td>
                            ${
                                displayStatus === 'Pending'
                                    ? `
                                        <button
                                            type="button"
                                            class="cancel-request-button"
                                            data-request-id="${request.id}">
                                            Cancel
                                        </button>
                                    `
                                    : '—'
                            }
                        </td>
                    `;

                }

                // APPROVER VIEW
                else {

                    row.innerHTML = `
                        <td>#${request.id}</td>
                        <td>${escapeHtml(request.requester_name)}</td>
                        <td>${escapeHtml(request.item_name)}</td>
                        <td>${escapeHtml(request.vendor)}</td>
                        <td>${request.quantity}</td>
                        <td>$${total.toFixed(2)}</td>
                        <td>${escapeHtml(request.justification)}</td>
                        <td>${status}</td>
                        <td>${comment}</td>
                        <td>${submitted}</td>

                        <td>
                            ${
                                displayStatus === 'Pending'
                                    ? `
                                        <button
                                            type="button"
                                            class="approve-request-button"
                                            data-request-id="${request.id}">
                                            Approve
                                        </button>

                                        <button
                                            type="button"
                                            class="deny-request-button"
                                            data-request-id="${request.id}">
                                            Deny
                                        </button>
                                    `
                                    : '—'
                            }
                        </td>
                    `;
                }

                tableBody.appendChild(row);

            });

        } catch (error) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="${isRequester ? 10 : 11}">
                        ${escapeHtml(error.message)}
                    </td>
                </tr>
            `;
        }
    }
}

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, character => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[character]));
}
