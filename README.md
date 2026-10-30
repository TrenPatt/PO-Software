# PO-Software

PO-Software is a local purchase-order management application built with Node.js, Express, and SQLite. It provides secure authentication, persistent data storage, and role-based access control for managing purchase orders and users.

## Local Setup

1. Ensure Node.js 22 LTS is installed.
2. Open a terminal in the project root.
3. Install dependencies:
   npm install
   On Windows PowerShell, you can use `npm.cmd install`.

4. Create a local environment file:
   Copy-Item .env.example .env

5. Open `.env` and configure your local settings. Generate a strong, random `SESSION_SECRET` and configure your administrator credentials.

6. Initialize the administrator accounts:
   npm run create-admin

7. Start the application:
   npm start

8. Open [http://localhost:3000](http://localhost:3000) in your browser.

## Administrator Setup

The application does not include default administrator credentials.

Administrator accounts are configured through environment variables in `.env`:

- `ADMIN_USERNAME` and `ADMIN_PASSWORD`
- `ADMIN_USERNAME_2` and `ADMIN_PASSWORD_2`
- `ADMIN_USERNAME_3` and `ADMIN_PASSWORD_3`

Run `npm run create-admin` to initialize the configured administrator accounts.

Existing accounts are skipped during subsequent initialization runs.

Never commit `.env` or real credentials to version control.

## Authentication and Roles

The application uses:

- **Express:** Backend API and application routing.
- **better-sqlite3:** Local relational database.
- **Argon2id:** Password hashing.
- **HTTP-only session cookies:** Authenticated session management.
- **Role-based access control:** Permissions based on user roles.

### User Roles

| Role | Permissions |
|---|---|
| `requestor` | Standard access and purchase-order submission |
| `approver` | Standard access and purchase-order approval workflows |
| `admin` | Standard access, user management, and administrative functions |

## Security Controls

The application is designed with the following security controls:

- Password hashing rather than plaintext password storage.
- Generic login failure messages.
- HTTP-only session cookies.
- Protected pages and API routes.
- Server-side administrative authorization.
- Login rate limiting.
- Input validation before database writes.
- Duplicate username and invalid role prevention.
- Administrative account deletion protections.

## Database

The application uses SQLite for persistent local storage.

The database is automatically initialized under:

`data/po_software.db`

The database schema includes user and session tables.

Database files are excluded from version control.

## User Management

Administrators can:

- View registered users.
- Search users by username or role.
- Create accounts with selected roles.
- Delete eligible user accounts.

Password hashes and session tokens are not displayed through the frontend.

## Testing Checklist

- Log in with valid credentials.
- Verify invalid credentials are rejected.
- Log out and verify the session is cleared.
- Attempt to access protected pages without authentication.
- Verify requestors and approvers cannot access administrative functionality.
- Verify administrator user-management functionality.
- Verify account deletion restrictions.

## Production Considerations

Before deploying the application:

- Set `NODE_ENV=production`.
- Use a strong, randomly generated `SESSION_SECRET`.
- Enable secure cookies when deployed over HTTPS.
- Configure appropriate production environment variables.
- Protect database files and backups.
- Never expose credentials or sensitive configuration through source control.
