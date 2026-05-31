# Vardiyan Project - To Do (TODO.md)

This file was created to track features that are missing, need testing, or will be added in the future.

## 🚀 Pending Features / Improvements

- [ ] **Fully Automated WhatsApp Notifications:** Automatically forward notifications to suitable matches when a new job posting is created (Firebase Triggers), instead of manually triggering them via the Admin panel.
- [ ] **Worker and Job Posting Filtering Improvements:** Smart filtering algorithm in the Admin panel matchmaking system based on distance, rating, or multiple criteria (workTypes etc.).
- [ ] **WhatsApp Template Improvements:** Dynamically improve the content (Template) of WhatsApp messages sent via Meta to include details such as business name and wage.
- [ ] **User Feedback System:** Allowing the worker and the restaurant to rate each other or provide feedback after the match.
- [ ] **Real-Time Notifications (In-App):** Allowing users to see the status of their applications via web notification / in-app notifications within the application.

## 🐛 Technical Debt / Refactoring
- [ ] End-to-end (E2E) testing to ensure that HTML element IDs are fully connected in the separated parts of `script.js` for workers.
- [ ] Performance improvement in the Admin panel (Using Firestore `onSnapshot` to fetch data in real-time without refreshing the page).
- [ ] UI/UX improvements (Animations, loading states, modern color palettes).

## 🌍 Production Environment Preparations
- [ ] Tightening Firestore Security Rules (Users can only see their own data).
- [ ] Firebase App Check integration for Production (Preventing fake traffic and abuse).
- [ ] Securing environment variables (Meta API keys etc.) with Google Cloud Secret Manager or Firebase Secrets.
