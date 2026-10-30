# PO-Software

PO-Software is a local purchase-order management application built with Node.js, Express, and SQLite. It provides secure authentication, persistent data storage, and role-based access control for managing purchase orders and users.

## Installation and Setup

Follow these steps to install and run the PO Software application locally.

### Prerequisites

- Node.js 22 LTS (Version `22.23.4`): https://nodejs.org/en/download
- Git: https://git-scm.com/downloads
- A code editor such as Visual Studio Code (recommended).

### Setup Instructions

**1. Clone the GitHub repository.**

Open a terminal and run:


git clone https://github.com/TrenPatt/PO-Software.git
cd PO-Software


**2. Install project dependencies.**


npm install


On Windows PowerShell, use `npm.cmd install` if the standard command is blocked by the execution policy.

**3. Create a local environment file.**


Copy-Item .env.example .env


**4. Configure environment variables.**

Open the newly created `.env` file and configure your local settings:

- Generate a strong, random `SESSION_SECRET`.

node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"

- Configure your administrator usernames and passwords.
- Ensure each administrator has unique credentials.

Each team member should configure their own local credentials. Never upload your `.env` file to GitHub.

**5. Initialize the administrator accounts.**

npm run create-admin

On Windows PowerShell, use:

npm.cmd run create-admin


**6. Start the application.**

npm start

On Windows PowerShell, use:

npm.cmd start

**7. Open the application.**

Navigate to the following address in your browser:

http://localhost:3000


**8. Closing**
Ctrl + C, to end the local host in the open terminal


### Important Notes

- The SQLite database is automatically created locally when the application initializes.
- Each team member has their own local database and administrator accounts.
- Do not commit or upload your `.env` file, SQLite database, or `node_modules` folder to GitHub.
- Ensure you have been added as a collaborator to the private GitHub repository.
- If another team member has pushed changes, run `git pull origin main` before starting your work to get the latest version.

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
