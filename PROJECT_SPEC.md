# BlockFactory Management: Project Specification

## Status and implementation rule

This document is the authoritative specification for this project. Read it before making any future changes. Do not invent business rules that are not recorded here. The current implementation is **Phase 1: foundation only**.

## Product

BlockFactory Management is a mobile-first progressive web application for managing multiple independent block factory and cement companies.

## Technology

- React with Vite
- JavaScript
- Progressive Web App (PWA)
- Mobile-first responsive interface
- Future backend: Google Apps Script API
- Future database: Google Sheets

## Users and roles

- `SUPER_ADMIN`: platform-level user; may operate across companies.
- `OWNER`: belongs to exactly one company.
- `SECRETARY`: belongs to exactly one company.

Role access and navigation must be controlled by authenticated role data.

## Multi-company model

- Each company has a permanent identifier, for example `FAC-001` or `FAC-002`.
- A non-`SUPER_ADMIN` user belongs to exactly one company.
- Company identity must ultimately come from authenticated backend information.
- The frontend must not let a user type or alter a Company ID to gain access to another company.
- New feature data models and API requests must remain company-scoped by trusted authenticated context, not by user-editable route or form values.

## Phase 1 scope

- Project scaffold and PWA configuration.
- Scalable client folder structure.
- Basic routing.
- Placeholder screens for Login, Super Admin Dashboard, Owner Dashboard, and Secretary Dashboard.
- Role-based navigation architecture.
- Authentication service interface with local development-only placeholder sessions.

## Explicitly out of scope for Phase 1

- Sales
- Production
- Stock
- Expenses
- Customers
- Supplier payments
- Reports
- Google Sheets integration
- Google Apps Script integration
- Production authentication and authorization backend

## Future integration boundary

The `authService` interface is the sole frontend authentication boundary for now. Replace its development implementation with Google Apps Script API calls in a future phase, without allowing clients to choose their company context.
