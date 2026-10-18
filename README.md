# Smart Health - AI-Driven Health Center & Supply Chain Management
AI-driven Smart Health uses real-time monitoring to manage medicine stocks, patient footfall, bed availability, doctor attendance, and test services across PHCs and CHCs. It predicts shortages, forecasts demand, and recommends resource redistribution to improve healthcare efficiency and accessibility.

# Run & Operate
pnpm --filter @workspace/api-server run dev — run the API server (port 5000)
pnpm run typecheck — full typecheck across all packages
pnpm run build — typecheck + build all packages
pnpm --filter @workspace/api-spec run codegen — regenerate API hooks and Zod schemas from the OpenAPI spec
pnpm --filter @workspace/db run push — push DB schema changes (dev only)
Required env: DATABASE_URL — Postgres connection string

## ✨ Key Features

### 1. Healthcare Operations Dashboard
- Monitor healthcare facility readiness.
- View district-level healthcare information.
- Track healthcare capacity and operational indicators.
- Identify facilities that may require additional support.

### 2. Facility Monitoring
- Monitor healthcare facility status.
- Track medicine availability.
- Monitor staffing and bed capacity.
- Review diagnostic service availability.
- Understand changes in facility readiness.

### 3. User Authentication
- User registration and sign-in interfaces.
- Email and password authentication.
- Google sign-in interface.
- Protected workspace access, when authentication is configured.

### 4. District Overview
- View a shared operational picture of local healthcare.
- Review facility reporting status.
- Monitor healthcare capacity indicators.
- Support coordination between district teams and healthcare facilities.

### 5. Responsive User Interface
- Clean and modern design.
- Responsive layouts for different screen sizes.
- Accessible navigation and clear information presentation.
- Healthcare-focused colors and visual indicators.

### 6. Human-Centered Decision Support
- Present operational information to support human decisions.
- Highlight potential gaps in healthcare capacity.
- Support recommendations that healthcare professionals can review.

> **Note:** The features above describe the intended product capabilities. Actual functionality depends on the implementation of the frontend, API, database, and authentication services.

---

## 🛠️ Tech Stack

### Frontend
- React.js
- TypeScript 5.9
- HTML5
- CSS3
- API hooks generated from the OpenAPI specification

### Backend
- Node.js 24
- TypeScript
- Express 5
- REST API architecture
- OpenAPI API specification

### Database
- PostgreSQL
- Drizzle ORM
- Drizzle Zod integration
- Zod v4 for data validation

### API Development
- OpenAPI specification
- Orval for API code generation
- Generated API hooks and Zod schemas

### Build Tools
- pnpm workspaces
- esbuild
- TypeScript compiler

---

## 📋 Prerequisites

Before running the project, make sure you have installed:

- Node.js 24
- pnpm
- PostgreSQL
- Git

Check your installed versions:

```bash
node --version
pnpm --version
git --version
