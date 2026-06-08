# Enterprise Management System: Upgrade Implementation Plan

This document outlines the strict dependency order, technical explanations, and AI generation prompts required to build the new system features within your Antigravity IDE environment.

## I. Implementation Dependency Order
To ensure a smooth build process without circular dependencies, implement the modules in the following strict order:

1.  **Core RBAC & Company Profile (Foundation)**
    * *Why:* Every other feature relies on knowing *who* the user is (Role) and the global company context.
2.  **Employee Lifecycle Management (ELM)**
    * *Why:* You need users in the database before you can assign them to departments or org charts.
3.  **Organizational Hierarchy & Departments**
    * *Why:* Departments require managers (from ELM), and the Org Chart requires the reporting structure between employees.
4.  **Hierarchical Document Management (DMS)**
    * *Why:* File visibility rules depend completely on the RBAC matrix and the Organizational Hierarchy established in steps 1 and 3.
5.  **Dashboard & News Board (Presentation)**
    * *Why:* The dashboard pulls aggregated data ("Recent Members", "Recent Tasks") from all the previously built modules.

---

## II. Feature Breakdown & AI Prompts

*Note on AI Models: For complex architectural logic and backend services, **DeepSeek v4 Pro** or **Claude AI** are highly recommended within Antigravity. For rapid UI component generation and frontend scaffolding, use **Gemini Flash/3.5**.*

### 1. Core RBAC & Company Corporate Identity
**Explanation:** Establishes the 3-tier permission matrix (Admin/CEO, Manager, Employee) and the basic company settings (Name, Logo, Mission).
**Target AI Model:** DeepSeek v4 Pro (for robust database schema design)

**Antigravity Prompt:**
> "I am building an Enterprise Management System. Generate the database schema (SQL/ORM) and the backend middleware for a strict 3-Tier Role-Based Access Control (RBAC) system. The tiers are: 1. Admin/CEO (Global access), 2. Manager (Department-level access), 3. Employee (Self-level access). Also, create a `CompanyProfile` model with fields for name, logo URL, mission, and contact details. Ensure the middleware can intercept requests and validate the user's tier before allowing CRUD operations."

### 2. Employee Lifecycle Management (ELM)
**Explanation:** Handles registering, updating, firing, and joining of employees. Retains historical data for fired/resigned employees without deleting records.
**Target AI Model:** Claude AI (for solid business logic and edge-case handling)

**Antigravity Prompt:**
> "Create an Employee Lifecycle Management (ELM) backend module. Implement the complete CRUD API routes for registering a new employee, updating their profile, and an offboarding route (fire/resign). The offboarding route must NOT delete the database record; instead, it should toggle an `isActive` boolean to false, revoke system access tokens, and record the termination date. Assume integration with the previously built 3-Tier RBAC system."

### 3. Organizational Hierarchy & Departments
**Explanation:** Builds the tree structure of the company. Includes department registries restricted to Admin, and auto-generates the visual org chart data.
**Target AI Model:** DeepSeek v4 Pro (Backend/Tree Logic) + Gemini Flash (Frontend UI)

**Antigravity Prompt (Backend - DeepSeek/Claude):**
> "Design a Department and Organizational Hierarchy module. Create a `Department` schema that links a Manager (from the Employee table) to multiple sub-employees. Then, write a recursive function or API endpoint that outputs a nested JSON tree structure representing the entire company hierarchy from CEO down to employees, which will be used to render an Org Chart. Restrict the department creation/update endpoints strictly to the 'Admin' tier."

**Antigravity Prompt (Frontend - Gemini Flash):**
> "Create a React/Frontend component that takes a nested JSON tree of employee relationships and renders a visually appealing, auto-generating Organizational Chart. Include nodes for CEO, Managers, and Employees with their names and titles. Use standard CSS or a lightweight library compatible with modern web environments."

### 4. Hierarchical Document Management System (DMS)
**Explanation:** A file repository where Admins see everything, Managers see their department's files, and Employees only see what they are explicitly allowed to see.
**Target AI Model:** Claude AI or DeepSeek v4 Pro (Crucial for security logic)

**Antigravity Prompt:**
> "Develop a Hierarchical Document Management API. When a file is uploaded, it must be tagged with the uploader's ID, department, and access level. Write the access logic for the 'GET /documents' route: 
> - If the user is Admin/CEO, return all documents.
> - If the user is a Manager, return documents uploaded by them and by any employee within their specific department ID.
> - If the user is an Employee, return only documents they uploaded, or documents explicitly flagged as 'global_read' or explicitly shared with them.
> Provide the backend logic ensuring lower tiers absolutely cannot bypass these filters."

### 5. Dynamic Dashboard & News Board
**Explanation:** The main landing page featuring company news, recent hires, and recent tasks.
**Target AI Model:** Gemini Flash 3.5 (Excellent for dashboard UI and data aggregation)

**Antigravity Prompt:**
> "Build a main Dashboard component for an internal company portal. It should include three main sections: 
> 1. A 'News Board' component for displaying official text updates and announcements.
> 2. A 'Recent Members' widget that fetches and displays the 5 most recently onboarded employees.
> 3. A 'Recent Tasks' widget displaying the latest company activities. 
> Write the frontend layout utilizing a clean, modern grid system, and provide the backend API aggregation query needed to populate these three widgets efficiently on load."
