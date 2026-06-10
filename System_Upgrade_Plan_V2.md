# App Upgrade Implementation Plan V2

This document provides the task explanations, optimal AI models, and Antigravity IDE prompts required to execute the new feature upgrade plan.

## 1. Organization Chart State Persistence
**Explanation:** Currently, the organization chart loses its edited state upon page refresh. This means the frontend visual changes are not being explicitly saved to the backend database via a PUT/POST API call. We need to implement an auto-save or a manual "Save Changes" feature that updates the `reports_to` or `parent_id` relationships in the database.
**Target Model:** Gemini Flash 3.5 (Excellent for React/Frontend state management and API integration)

**Antigravity Prompt:**
> "Fix the Organization Chart component so that edits persist after a page refresh. The current implementation updates the UI but does not save the new tree structure to the backend. Please implement a mechanism to send an API request (e.g., PUT /api/organization/update-hierarchy) whenever a node is moved or edited. Provide the updated frontend component code (using React/Vue state hooks to handle the save trigger) and the corresponding backend route to update the database records."

---

## 2. Expanded Employee Levels & Localization (i18n)
**Explanation:** The application needs 8 explicit hierarchy levels mapped in the database, with full bilingual support. Based on your system preference for English technical outputs, the code will remain in English, but the UI strings will toggle based on the selected mode.
**Target Model:** Claude AI (Great for data structure updates combined with localization configurations)

**Antigravity Prompt:**
> "Update the Employee/User model to support 8 specific hierarchy levels: CEO, President, Vice president, Senior Manager, Department Manager, Supervisor, Team Leader, and Department Member. Modify the database schema (using enums or a linked Role table). Additionally, configure the frontend internationalization (i18n) files. Provide the JSON key-value pairs for both English ('en') and Arabic ('ar') so these exact titles translate automatically when the user switches to Arabic mode."

---

## 3. Reactive User Profile Display
**Explanation:** As shown in `image_0b221c.png`, the user profile widget at the bottom of the sidebar (displaying the name and initials) must instantly reflect any changes made to the user's profile without requiring a hard refresh.
**Target Model:** Gemini Flash 3.5 (Perfect for UI reactivity and global state)

**Antigravity Prompt:**
> "Update the sidebar User Profile widget (which displays the user's name and initials, similar to 'Aung Kyaw (AK)') to be completely reactive. When the user edits their profile name in the settings, the global state (e.g., Redux, Context API, or Vuex) must update immediately. Provide the updated Profile Widget component code that subscribes to this global user state so it matches the edited name instantly without a page refresh."

---

## 4. Four-Tier Role-Based Access Control (RBAC)
**Explanation:** A strict redefinition of the authorization middleware into 4 distinct levels. The Admin has absolute power and can delegate Admin status to others.
**Target Model:** DeepSeek v4 Pro (Unmatched for complex backend security, authorization logic, and middleware routing)

**Antigravity Prompt:**
> "Completely overhaul the RBAC middleware and backend logic into 4 specific access levels. 
> Level 1 (Entry): Read-only access to organization chart, projects, assignments, and news.
> Level 2 (Manager): Inherits Level 1, plus the ability to create/edit members under their specific department only. They CANNOT remove/delete members.
> Level 3 (Senior Manager): Inherits Level 2, plus the ability to remove members and create new chat channels under their department.
> Level 4 (CEO/Admin): Full system access. Admins can assign Admin/CEO privileges to any other member.
> Write the secure backend middleware interceptors that enforce these strict permission rules across the API endpoints."

---

## 5. Advanced Document & Project File Management
**Explanation:** Secure the file repository so that upload (add) and delete (remove) capabilities are exclusively locked to the Admin/CEO tier. Furthermore, give Admins the power to dynamically adjust the read visibility of individual documents for lower tiers.
**Target Model:** DeepSeek v4 Pro or Claude AI (Essential for secure file handling and granular permission structures)

**Antigravity Prompt:**
> "Upgrade the Project and Organization Document Management system. Restrict the API routes for uploading (adding) and deleting (removing) files strictly to the 'Admin/CEO' access level. Add a new 'access_level' permission column to the Document database schema. Provide the backend logic and the frontend interface that allows an Admin to manually adjust which lower access levels (Entry, Manager, Senior Manager) are permitted to view or download a specific uploaded document."
