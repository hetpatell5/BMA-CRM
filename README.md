# BMA CRM — Academic ERP & Student Administration System

A production-grade, full-stack CRM and Student Administration platform built for educational institutions and consultancies. The system consolidates student lifecycle management, lead tracking, team operations, bulk data import, payment management, shipping, and daily follow-ups into a single unified application with a polished, professional UI.

---

## Project Overview

BMA CRM replaces legacy spreadsheet workflows with a centralized relational database and a rich web interface. It is designed for organisations that manage large volumes of student enrollments, lead inquiries, and internal staff teams simultaneously. Every module is role-aware, real-time capable, and optimised for speed.

---

## Feature Modules

### 1. Authentication & Session Management
- **JWT-based authentication** with BCrypt password hashing.
- **"Remember Me" toggle** on the login page — persists the session for 7 days via cookies when checked; falls back to a session-only token otherwise.
- **Secure logout**: Clears all in-memory and cookie state and performs a hard redirect to `/login`, preventing any data leakage between user sessions.
- **Profile & avatar management**: Users can upload a profile picture, update personal details, and change their password.

### 2. Role-Based Access Control (RBAC)

| Role | Description |
|------|-------------|
| `ADMIN` | Full system access — can manage all data, users, configuration, and run imports. |
| `MANAGER` | Can manage team members, view all staff, and access payment records. |
| `STAFF` | Scoped access to their own assigned work. |

**Specialized Staff Sub-Roles** (assigned by Admin/Manager):

| Sub-Role | Description |
|----------|-------------|
| `GUIDE` | Guides students through their academic journey (degree-mapped). |
| `EXPERT` | Subject-matter expert assigned to specific orders. |
| `BOTH` | Dual role as both Guide and Expert. |
| `TELECALLER` | Handles lead follow-up calls; has a dedicated Telecaller Dashboard. |
| `WRITER` | Handles writing-related student work. |

### 3. Role-Specific Dashboards
- **Admin / Manager Dashboard**: Full stats overview — order breakdown by category, revenue metrics (Soft Copy, Hard Copy, Total Collected, Payment Pending), lead pipeline funnel, team availability, expert workload, monthly trends chart, and recent import history.
- **Telecaller Dashboard**: Focused view of leads, daily follow-ups, and calling tasks.
- **Staff Dashboard**: Scoped view showing only the work assigned to the logged-in staff member.

### 4. Lead Management (CRM Pipeline)
- **Pipeline stages**: `NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → WON / LOST`.
- **Lead details**: Contact info, source, assigned staff, priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), notes, and follow-up scheduling.
- **Activity log**: Full audit trail of calls, emails, stage changes, and notes per lead.
- **Quick filters & search** across all lead fields.
- **Lead sources**: `WEBSITE`, `REFERRAL`, `SOCIAL_MEDIA`, `EXCEL_IMPORT`, `WALK_IN`, `PHONE_INQUIRY`, `MANUAL`.

### 5. Student / Order Management
- **Student lifecycle statuses**: `NEW_LEAD → SYNOPSIS_SENT → GUIDE_ASSIGNED → REPORT_IN_PROGRESS → SHIPPED → ALL_DONE`.
- **Custom fields**: Per-student JSON custom fields — adaptable to any form template.
- **Staff assignment matrix**: Assigns a primary guide (`assignedGuide`), a primary telecaller (`assignedBy`), and optionally a co-handler (`coHandledBy`) to each student order.
- **Per-requirement assignments**: Tracks multiple `{requirement, guideId, guideName, assignedById, assignedAt}` entries per student via a JSONB array.
- **Detailed student profile page** with editable fields, status management, and assignment history.
- **Shiprocket integration**: Create and track physical shipments directly from an order's profile page (AWB, courier, status stored back in customFields).

### 6. Daily Follow-Ups
- Standalone module at `/follow-ups` for managing daily calling tasks.
- **Add / Edit / Delete** follow-up records with name, phone number, description, requirement, and a deadline date.
- **Upcoming alert panel**: Highlights all follow-ups due today or overdue.
- **Debounced search** across name, number, description, and requirement fields.
- **Related follow-ups viewer**: Click any phone number to see the full contact history for that number.
- **Access**: `ADMIN`, `MANAGER`, and `TELECALLER` roles.

### 7. Bulk Import Engine
- **Drag-and-drop Excel / CSV upload** with a visual column-mapping interface.
- **Smart AI-assisted column mapper** (`smartMapper.js`) — automatically suggests field mappings from uploaded headers.
- **Background processing** via Bull queues and Redis (`ioredis`) — large imports do not block the UI.
- **Real-time progress** powered by Socket.io WebSocket events during active imports.
- **Duplicate handling**: configurable `skip` or `update` strategies.
- **Import history**: Full log of past imports with status, record counts, and deletion support.
- **Access**: `ADMIN` role only.

### 8. Team Management
- **Member directory** with name, email, role badge, staff sub-role, and status.
- **Add / Edit / Delete members** with a role-description hint on the form.
- **Assign sub-roles** (Guide, Expert, Telecaller, Writer) with optional degree mapping.
- **Payment configuration**: Admin can store bank details (bank name, account holder name, account number, IFSC, branch, UPI ID) per member.
- **QR Scanner & Bank Passbook uploads**: Secure image uploads stored in `/uploads`, viewable in a full-screen zoom viewer.
- **Team hierarchy**: Each `STAFF` member can be linked to a `leader_id` (a MANAGER).

### 9. Member Dashboard (`/team/[id]`)
- **Per-member analytics page** showing their complete work record.
- **Fixed Pricing Table**: Admin/Manager can define and edit per-degree/per-service pricing for each member.
- **Work Record & Payments**: Two separate tables — Completed (payable) and In-Progress orders — with automatic amount matching against the pricing table.
- **Mark Payment Done**: Creates a payment record and auto-generates a downloadable PDF invoice (via Puppeteer).
- **Payment History**: Full log of past payments with invoice links.

### 10. Task Management (Kanban)
- **Kanban board** at `/tasks` with statuses: `TODO`, `IN_PROGRESS`, `IN_REVIEW`, `BLOCKED`, `COMPLETED`, `CANCELLED`.
- **Dynamic task templates**: Admin-defined field schemas attached to tasks.
- **Task updates**: Hourly progress updates with hours-spent tracking.
- **Task comments**: Threaded discussion per task.
- **Assignment**: Each task has an `assignedTo` and `assignedBy` member.

### 11. Notifications
- **In-app notification bell** with real-time updates via Socket.io.
- Notification types: `NEW_LEAD`, `LEAD_ASSIGNED`, `STUDENT_ASSIGNED`, `IMPORT_DONE`, `TASK_ASSIGNED`, `NEW_ORDER`, `TASK_UPDATED`.
- Notifications are stored per-user and support read/unread state.

### 12. Shiprocket Integration
- Create Shiprocket shipments directly from an order profile (auto-fills customer name, phone, address from CRM data).
- Track live AWB status — status is written back to the order's `customFields`.
- Pickup address selection from your configured Shiprocket account.
- **Access**: `ADMIN` and `MANAGER` roles.

### 13. App Settings & Order Form Config
- **Admin-managed app-wide settings** (stored in `app-settings.json`) configurable via the `/settings` page.
- **Order Form Config**: Dynamically configures which fields appear on the student creation / edit form, stored in the `order_form_config` table.
- **Order ID generation rules**: Configurable auto-ID rules stored in `order-id-rules.json`.

### 14. Reports
- Reports page at `/reports` for on-demand analytics.
- Filter by date range, member, and status.

### 15. User Availability
- Staff members can set their real-time availability status: `AVAILABLE`, `BUSY`, `ON_BREAK`, `SHORT_LEAVE`, `OFFLINE`.
- A status note (e.g., "Back at 3 PM") can be added.
- The Admin/Manager Dashboard shows a live **Team Status** panel with online indicators.

### 16. Alert Service
- Background `alertService` runs at startup and sends timed notifications (e.g., follow-up reminders) via Socket.io.

### 17. Navigation & Performance
- **Responsive layout**: Collapsible sidebar with icon-only mode on smaller viewports.
- **Skeleton loaders**: All async data views display skeleton placeholders while loading.
- **Toast notifications**: Success, error, and informational toasts for every user action.
- **Dual theme**: Full dark and light mode, switchable from the header, with smooth transitions.

---

## UI / UX Design

- **Glassmorphism aesthetic**: Semi-transparent frosted-glass cards with adaptive dark and light theme support.
- **Dual theme**: Full dark and light mode, switchable from the header.
- **Consistent button system**: Solid, rounded-rectangle primary buttons using a unified design token.
- **Toast notifications**: Success, error, and informational toasts for every user action.
- **Responsive layout**: Collapsible sidebar with icon-only mode on smaller viewports.
- **Stable modals**: All modal overlays are fixed-positioned to prevent Radix UI scroll-lock from causing page jumps.

---

## Tech Stack

### Frontend
| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS, PostCSS |
| Component Library | Radix UI / shadcn/ui |
| State — Client | Zustand |
| State — Server | TanStack Query (React Query v5) |
| Data Tables | TanStack Table v8 |
| Real-time | `socket.io-client` |
| Auth Persistence | `js-cookie` |
| Charts | Recharts |
| Icons | Lucide React |
| HTTP Client | Axios |

### Backend
| Layer | Technology |
|-------|------------|
| Runtime | Node.js (ESM) |
| Framework | Express.js |
| ORM | Prisma |
| Database | **MySQL** |
| Queue / Cache | Bull + Redis (`ioredis`) |
| Real-time | Socket.io |
| File Uploads | Multer |
| Excel Parsing | `xlsx` |
| PDF Generation | Puppeteer |
| Email | Nodemailer |
| Validation | Zod |
| Security | Helmet, CORS, express-rate-limit, compression |
| Auth | JWT + BCrypt |
| Shipping | Shiprocket API |

---

## Database Schema (MySQL / Prisma)

| Table | Purpose |
|-------|---------|
| `users` | Authentication, role hierarchy, bank details, avatar, staff sub-role, and team leader FK. |
| `students` | Full order records — contact info, academic info, subjects (JSON), status, staff assignment FKs, custom JSONB fields. |
| `leads` | Full CRM pipeline data with stage, priority, source, and contact details. |
| `lead_activities` | Audit log of all lead interactions (calls, emails, stage changes, notes). |
| `tasks` | Kanban task board entries with dynamic field data, progress tracking, and attachments. |
| `task_templates` | Admin-defined dynamic field schemas for tasks. |
| `task_updates` | Hourly progress update entries per task. |
| `task_comments` | Threaded comment entries per task. |
| `user_availability` | Per-user real-time availability status and note. |
| `activity_logs` | System-level activity log (task start/complete, status changes). |
| `import_history` | Batch import records with status, record counts, and column mapping. |
| `payment_records` | Per-member payment history with invoice path and student breakdown snapshot. |
| `member_pricing` | Per-member fixed pricing table for degree/service types. |
| `notifications` | Per-user in-app notification records. |
| `order_form_config` | Dynamically configured order creation form fields (JSON config). |
| `daily_follow_ups` | Daily follow-up records with contact name, number, description, requirement, and deadline. |

---

## Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [MySQL](https://www.mysql.com/) server
- [Redis](https://redis.io/) server (port 6379)

### 1. Clone & Root Install
```bash
git clone <repo-url>
cd crm-student-admin
npm install        # installs concurrently for the dev script
```

### 2. Backend Setup
```bash
cd backend
npm install
cp .env.example .env
```

Edit `.env`:
```env
DATABASE_URL="mysql://root:password@localhost:3306/crm_db"
JWT_SECRET="your-secret-key"
REDIS_URL="redis://localhost:6379"
PORT=5000
SHIPROCKET_EMAIL="your-shiprocket-email"
SHIPROCKET_PASSWORD="your-shiprocket-password"
```

```bash
npx prisma db push      # sync schema to MySQL
node prisma/seed.js     # (optional) seed demo data
npm run dev             # starts backend on :5000
```

### 3. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env.local
```

Edit `.env.local`:
```env
NEXT_PUBLIC_API_URL=http://localhost:5000/api
```

```bash
npm run dev     # starts Next.js on :3000
```

### 4. Run Both Together (from project root)
```bash
npm run dev     # concurrently starts backend (:5000) + frontend (:3000)
```

The application is accessible at **http://localhost:3000**.

---

## Default Roles & Access Matrix

| Feature | Admin | Manager | Staff / Guide / Expert | Telecaller |
|---------|-------|---------|------------------------|------------|
| Full Dashboard | ✅ | ✅ | ❌ (Staff Dashboard) | ❌ (Telecaller Dashboard) |
| Orders (Students) | ✅ | ✅ | ✅ (own orders) | ✅ |
| Leads | ✅ | ✅ | ✅ | ✅ |
| Daily Follow-Ups | ✅ | ✅ | ❌ | ✅ |
| Import Data | ✅ | ❌ | ❌ | ❌ |
| Payments | ✅ | ✅ | ❌ | ❌ |
| Team Management | ✅ | ✅ | ❌ | ❌ |
| Shiprocket Shipping | ✅ | ✅ | ❌ | ❌ |
| App Settings | ✅ | ✅ | ❌ | ❌ |
| Tasks | ✅ | ✅ | ✅ | ✅ |
| Delete Members | ✅ | ❌ | ❌ | ❌ |
| Mark Payments | ✅ | ❌ | ❌ | ❌ |

---

*This repository is actively maintained as part of a production CRM deployment for BMA.*
