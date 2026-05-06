# BMA CRM — Academic ERP & Student Administration System

A production-grade, full-stack Customer Relationship Management (CRM) and Student Administration platform built for educational institutions and consultancies. The system consolidates student lifecycle management, lead tracking, team operations, bulk data import, and payment management into a single unified application with a polished, professional UI.

---

##  Project Overview

BMA CRM replaces legacy spreadsheet workflows with a centralized relational database and a rich web interface. It is designed for organisations that manage large volumes of student enrollments, lead inquiries, and internal staff teams simultaneously. Every module is role-aware, real-time capable, and optimised for speed.

---

##  Feature Modules

### 1. Authentication & Session Management
- **JWT-based authentication** with BCrypt password hashing.
- **"Remember Me" toggle** on the login page — persists the session for 7 days via cookies when checked; falls back to a session-only token otherwise.
- **Secure logout**: Clears all in-memory and cookie state and performs a hard redirect to `/login`, preventing any data leakage between user sessions.
- **Profile & avatar management**: Users can upload a profile picture, update personal details, and change their password.

### 2. Role-Based Access Control (RBAC)

| Role | Description |
|------|-------------|
| `ADMIN` | Full system access — can manage all data, users, and configuration. |
| `MANAGER` / Leader | Can manage team members, view all staff, import data, and access payment records. |
| `STAFF` | Order-level access scoped to their own assigned work. |

**Specialized Staff Sub-Roles** (assigned by Admin/Manager):

| Sub-Role | Description |
|----------|-------------|
| `GUIDE` | Guides students through their academic journey (degree-mapped). |
| `EXPERT` | Subject-matter expert assigned to specific orders. |
| `BOTH` | Dual role as both Guide and Expert. |
| `TELECALLER` | Handles lead follow-up calls. |
| `WRITER` | Handles writing-related student work. |

### 3. Lead Management (CRM Pipeline)
- **Kanban-style pipeline** with stages: `NEW → CONTACTED → QUALIFIED → PROPOSAL → NEGOTIATION → WON / LOST`.
- **Lead details**: Contact info, source, assigned staff, priority (`LOW`, `MEDIUM`, `HIGH`, `URGENT`), notes, and follow-up scheduling.
- **Activity log**: Full audit trail of calls, emails, status changes, and notes per lead.
- **Quick filters & search** across all lead fields.

### 4. Student / Order Management
- **Full lifecycle tracking** from enrollment to completion (`ACTIVE`, `ALL_DONE`, `SHIPPED`, `PAUSED`, etc.).
- **Dynamic custom fields** per student using Postgres JSONB — adaptable to any form template.
- **Staff assignment matrix**: Explicitly assigns a Guide, Expert, Telecaller, or Writer to each student order.
- **Detailed student profile page** with editable fields, status management, and assignment history.

### 5. Bulk Import Engine
- **Drag-and-drop Excel / CSV upload** with a visual column-mapping interface.
- **Background processing** via Bull queues and Redis — large imports do not block the UI.
- **Real-time progress bar** powered by Socket.io WebSocket events during active imports.
- **Duplicate handling**: configurable `skip` or `update` strategies.
- **Import history**: Full log of past imports with status, record counts, and one-click deletion (with optional rollback of imported records).
- **Access**: Available to `ADMIN` and `MANAGER` roles.

### 6. Team Management
- **Member directory** with name, email, role badge, staff sub-role, and status displayed in a clean table.
- **Add / Edit / Delete members** with a role-description hint on the form.
- **Assign sub-roles** (Guide, Expert, Telecaller, Writer) via an inline action menu — with degree input for Guide and Expert roles.
- **Payment configuration**: Admin can store bank details (bank name, account number, IFSC, UPI ID) per member.
- **View member card**: Full profile pop-up with bank details.

### 7. Member Dashboard (`/team/[id]`)
- **Per-member analytics page** showing their complete work record.
- **Fixed Pricing Table**: Admin/Manager can define and edit per-degree pricing for each member.
- **Work Record & Payments**: Two separate tables — Completed (payable) and In-Progress orders — with automatic amount matching against the pricing table.
- **Mark Payment Done**: Creates a payment record and auto-generates a downloadable invoice.
- **Payment History**: Full log of past payments with invoice links.
- **QR Scanner & Bank Passbook uploads**: Secure image upload for payment verification, with a full-screen zoom viewer.

### 8. Payment Management
- Centralised payment records across all team members.
- Invoices generated automatically on payment confirmation.

### 9. Form Templates
- Admin-defined dynamic field schemas (text, number, date, multiple-choice, etc.).
- Templates are linked to student creation forms, allowing custom fields per program type.

### 10. Leader / Manager Dashboard
- Aggregated view of team performance and order statistics.
- Filter by date range, member, and status to generate on-demand reports.

### 11. Navigation & Performance
- **Navigation Progress Bar**: A top-loading bar appears on every page transition for instant visual feedback.
- **Prefetched routes**: Sidebar links use `prefetch={true}` for near-instant page loads.
- **Skeleton loaders**: All async data views display skeleton placeholders while loading.

---

##  UI / UX Design

- **Glassmorphism aesthetic**: Semi-transparent frosted-glass cards with adaptive dark and light theme support.
- **Dual theme**: Full dark and light mode, switchable from the header, with smooth `0.3s` transitions.
- **Consistent button system**: Solid, rounded-rectangle primary buttons using a unified design token across the entire app.
- **Toast notifications**: Success, error, and informational toasts for every user action.
- **Responsive layout**: Collapsible sidebar with icon-only mode on smaller viewports.
- **Stable modals**: All modal overlays are fixed-positioned with `!mt-0` overrides to prevent Radix UI scroll-lock from causing page jumps.

---

##  Tech Stack

### Frontend
| Layer | Technology |
|-------|------------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| Styling | Tailwind CSS, PostCSS |
| Component Library | Radix UI / shadcn/ui |
| State — Client | Zustand |
| State — Server | TanStack Query (React Query v5) |
| Real-time | `socket.io-client` |
| Auth Persistence | `js-cookie` |
| Charts | Recharts |
| Icons | Lucide React |

### Backend
| Layer | Technology |
|-------|------------|
| Runtime | Node.js |
| Framework | Express.js |
| ORM | Prisma |
| Database | PostgreSQL |
| Queue / Cache | Bull + Redis |
| Real-time | Socket.io |
| File Uploads | Multer |
| Excel Parsing | `xlsx` |
| Validation | Zod |
| Security | Helmet, CORS, express-rate-limit |
| Auth | JWT + BCrypt |

---

##  Database Schema (PostgreSQL / Prisma)

| Table | Purpose |
|-------|---------|
| `users` | Authentication, role hierarchy, bank details, avatar, and staff sub-role. |
| `students` | 30+ fields per order including custom JSONB fields and staff assignment FKs. |
| `leads` | Full CRM pipeline data with stage, priority, and contact details. |
| `lead_activities` | Audit log of all lead interactions. |
| `tasks` | Kanban task board entries. |
| `templates` | Admin-defined dynamic field schemas. |
| `import_history` | Batch import records with status tracking. |
| `payment_records` | Per-member payment history with invoice paths. |
| `member_pricing` | Per-member fixed pricing table for degree/service types. |

---

##  Local Development Setup

### Prerequisites
- [Node.js](https://nodejs.org/) v18+
- [PostgreSQL](https://www.postgresql.org/) server
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
DATABASE_URL="postgresql://postgres:password@localhost:5432/crm_db"
JWT_SECRET="your-secret-key"
REDIS_URL="redis://localhost:6379"
PORT=5000
```

```bash
npx prisma db push      # sync schema to PostgreSQL
npx prisma db seed      # (optional) seed demo data
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

##  Default Roles & Access Matrix

| Feature | Admin | Manager | Staff |
|---------|-------|---------|-------|
| Dashboard | ✅ | ✅ | ✅ |
| Orders (Students) | ✅ | ✅ | ✅ |
| Leads | ✅ | ✅ | ✅ |
| Import Data | ✅ | ✅ | ❌ |
| Payments | ✅ | ✅ | ❌ |
| Team Management | ✅ | ✅ | ❌ |
| Form Templates | ✅ | ✅ | ❌ |
| Delete Members | ✅ | ❌ | ❌ |
| Mark Payments | ✅ | ❌ | ❌ |

---

*This repository is actively maintained as part of a production CRM deployment for BMA.*
