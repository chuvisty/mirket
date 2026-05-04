# Mirket Project - Current State (STATE.md)

## 📌 Project Overview
Mirket is a platform that quickly connects restaurant businesses with daily or full-time job seekers. The platform is currently built on a **"Broker / Agency Model"**. In this model, restaurants and workers cannot see each other's direct contact information. All matches are provided manually (or semi-automatically) by the **Admin** via WhatsApp or phone.

## 🏗 Architecture & Technologies
- **Frontend:** Vanilla HTML, CSS, JavaScript (Modular structure)
- **Backend (BaaS):** Firebase (Authentication, Firestore, Cloud Functions v2)
- **Deployment:** Firebase Hosting & GitHub Actions (CI/CD)

## 📂 File Structure and Modules (Refactored)
JavaScript files are divided by function rather than being a single huge file like `script.js`:
- `firebase.js`: Only Firebase Config and SDK initialization.
- `js/core.js`: Common functions, menu and routing operations, main triggers that run when the page loads.
- `js/auth-ui.js`: User login, registration, UI transitions, and Firebase Auth integration.
- `js/account.js`: Profile page operations, displaying current user information on the screen.
- `js/restaurant.js`: Operations for businesses to create job postings and list their current postings.
- `js/worker.js`: Operations for workers to apply for available jobs and see their application status (Pending, Approved, Rejected). Duplicate application prevention is handled here.
- `js/admin.js`: The panel where all incoming postings, workers, and applications are listed, and where the Admin performs the "Matching (Broker)" function.

## 🛠 Current Features (Completed)
- [x] **Firebase Auth:** Two separate registration flows as Business (Restaurant) or Worker.
- [x] **Firestore Structure:** `users`, `jobRequests` (Job Postings), `jobApplications` (Applications) collections.
- [x] **Admin Broker Panel:** Admin can find suitable workers with proper filtering for incoming job postings and send a WhatsApp notification with a single click via the system.
- [x] **WhatsApp Cloud Functions:** Sending official WhatsApp push notifications via Cloud Functions with Meta API integration (`sendmanualwhatsapppush`).
- [x] **Duplicate Application Prevention:** Preventing a worker from applying to the same job posting more than once.

## ⚠️ Known Limitations
- **Node.js 18 Decommission:** Moved to Node 20 since GitHub Actions no longer supports Node 18.
- **CORS & Gen 2 Functions:** The function name was changed to entirely lowercase (`sendmanualwhatsapppush`) because using uppercase letters (CamelCase) in function names causes a 404 error in Cloud Run service naming.
