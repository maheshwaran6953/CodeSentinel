# CodeSentinel

**Continuous Git-Integrated Authorship Verification for Academic Integrity**

An AI-driven platform that detects ghostwritten capstone projects through real-time GitHub monitoring, code stylometry, and automated conceptual interrogation.

## Project Overview

- **Problem:** Students outsource their capstone projects using AI tools or freelancers
- **Solution:** Monitor the entire development lifecycle using GitHub webhooks
- **Status:** In Development (Phase 0/1)

## Technology Stack

- **Frontend:** Angular 19
- **Backend:** NestJS (Node.js)
- **Database:** PostgreSQL (Supabase)
- **Queue:** Redis + BullMQ
- **LLM:** Groq API (LLaMA)
- **Deployment:** Vercel (frontend) + Render (backend)

## Project Structure

CodeSentinel/
├── frontend/ # Angular application
├── backend/ # NestJS API server
├── .gitignore
└── README.md

## Getting Started

### Frontend
```bash
cd frontend
npm install --legacy-peer-deps
npm start
```

### Backend (coming next)
```bash
cd backend
npm install --legacy-peer-deps
npm run start:dev
```

## Author

Mahesh Waran (B.Tech IT, VSB Engineering College)

## License

MIT