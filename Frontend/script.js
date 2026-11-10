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

            try {
                await apiRequest('/api/users/users', {
                    method: 'POST',
                    body: { username, password, role },
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
        const response = await apiRequest(`/api/users/users?search=${encodeURIComponent(searchValue)}`);
        tableBody.innerHTML = '';

        if (!response.users || response.users.length === 0) {
            tableBody.innerHTML = '<tr><td colspan="5">No users found.</td></tr>';
            return;
        }

        response.users.forEach((user) => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${user.username}</td>
                <td>${user.role}</td>
                <td>${user.status}</td>
                <td>${new Date(user.created_at).toLocaleDateString()}</td>
                <td><button type="button" class="action-button" data-user-id="${user.id}">Delete</button></td>
            `;
            row.querySelector('.action-button').addEventListener('click', async () => {
                const confirmed = window.confirm(`Delete user ${user.username}?`);
                if (!confirmed) return;
                try {
                    await apiRequest(`/api/users/users/${user.id}`, { method: 'DELETE' });
                    await loadUsers(document.getElementById('userSearch')?.value.trim() || '');
                } catch (error) {
                    window.alert(error.message);
                }
            });
            tableBody.appendChild(row);
        });
    } catch (error) {
        tableBody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
    }
}

function initPurchaseRequestForm() {

    const form = document.getElementById('purchaseRequestForm');

    const quantityInput = document.getElementById('quantity');
    const costInput = document.getElementById('unitCost');
    const totalDisplay = document.getElementById('requestTotal');

    const message = document.getElementById('requestMessage');

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

        }

    });

}

async function initViewRequests(user) {

    const isRequester = user.role === 'requestor';
    const isApprover = user.role === 'approver';

    const title = document.getElementById('requestsTitle');
    const description = document.getElementById('requestsDescription');

    if (isRequester) {

        title.textContent = 'My Purchase Requests';

        description.textContent =
            'View your submitted requests and track their approval status.';

    } else if (isApprover) {

        title.textContent = 'Purchase Requests to Review';

        description.textContent =
            'View purchase requests submitted by requestors.';

    } else {

        title.textContent = 'Purchase Requests';
        description.textContent = 'Access denied.';

        return;
    }

    document.getElementById('refreshRequests')
        .addEventListener('click', loadRequests);

    
// Handle cancellation button clicks
document.getElementById('requestTableBody')
    .addEventListener('click', async (event) => {

        const button = event.target.closest('.cancel-request-button');

        if (!button) return;

        const requestId = button.dataset.requestId;

        const confirmed = window.confirm(
            `Are you sure you want to cancel purchase request #${requestId}?`
        );

        if (!confirmed) return;

        button.disabled = true;

        const message = document.getElementById('requestsMessage');

        try {

            const response = await apiRequest(
                `/api/purchase-requests/${requestId}/cancel`,
                {
                    method: 'DELETE'
                }
            );

            message.textContent = response.message;
            message.className = 'form-message success';

            // Refresh the request table
            await loadRequests();

        } catch (error) {

            message.textContent = error.message;
            message.className = 'form-message error';

            button.disabled = false;

        }

    });

    await loadRequests();


    async function loadRequests() {

        const tableHead = document.getElementById('requestTableHead');
        const tableBody = document.getElementById('requestTableBody');
        const message = document.getElementById('requestsMessage');

        message.textContent = '';

        try {

            const response = await apiRequest('/api/purchase-requests');

            const requests = response.requests;

            tableHead.innerHTML = '';
            tableBody.innerHTML = '';

            // Different columns depending on user role
            
            if (isRequester) {

                tableHead.innerHTML = `
                    <tr>
                        <th>Request ID</th>
                        <th>Item</th>
                        <th>Vendor</th>
                        <th>Quantity</th>
                        <th>Unit Cost</th>
                        <th>Total</th>
                        <th>Status</th>
                        <th>Date Submitted</th>
                        <th>Action</th>
                    </tr>
                `;


            } else {

                tableHead.innerHTML = `
                    <tr>
                        <th>Request ID</th>
                        <th>Requester</th>
                        <th>Item</th>
                        <th>Vendor</th>
                        <th>Quantity</th>
                        <th>Total</th>
                        <th>Justification</th>
                        <th>Status</th>
                        <th>Date Submitted</th>
                    </tr>
                `;

            }

            if (requests.length === 0) {

                tableBody.innerHTML = `
                    <tr>
                        <td colspan="${isRequester ? 8 : 9}">
                            No purchase requests found.
                        </td>
                    </tr>
                `;

                return;
            }

            requests.forEach(request => {

                const row = document.createElement('tr');

                const total =
                    Number(request.quantity) *
                    Number(request.unit_cost);

                const date = new Date(
                    request.submitted_at + 'Z'
                ).toLocaleDateString();

                const displayStatus = request.cancelled_at
                    ? 'Cancelled'
                    : request.status;

                const status = `
                    <span class="status-pill status-${displayStatus.toLowerCase()}">
                        ${escapeHtml(displayStatus)}
                    </span>
                `;

                if (isRequester) {

                                        
                    row.innerHTML = `
                        <td>#${request.id}</td>
                        <td>${escapeHtml(request.item_name)}</td>
                        <td>${escapeHtml(request.vendor)}</td>
                        <td>${request.quantity}</td>
                        <td>$${Number(request.unit_cost).toFixed(2)}</td>
                        <td>$${total.toFixed(2)}</td>
                        <td>${status}</td>
                        <td>${date}</td>
                        <td>
                            ${
                                displayStatus === 'Pending'
                                    ? `<button
                                        type="button"
                                        class="cancel-request-button"
                                        data-request-id="${request.id}">
                                        Cancel
                                    </button>`
                                    : '—'
                            }
                        </td>
                    `;


                } else {

                    row.innerHTML = `
                        <td>#${request.id}</td>
                        <td>${escapeHtml(request.requester_name)}</td>
                        <td>${escapeHtml(request.item_name)}</td>
                        <td>${escapeHtml(request.vendor)}</td>
                        <td>${request.quantity}</td>
                        <td>$${total.toFixed(2)}</td>
                        <td>${escapeHtml(request.justification)}</td>
                        <td>${status}</td>
                        <td>${date}</td>
                    `;

                }

                tableBody.appendChild(row);

            });

        } catch (error) {

            tableBody.innerHTML = `
                <tr>
                    <td colspan="${isRequester ? 9 : 9}">
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
