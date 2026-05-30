# Lakshmi Ganapati — Weekly Collection App

Full-stack app for **Lakshmi Ganapati** weekly collections: **customer login** to view loan details, **manager login** to add clients, track weekly payments, and send payment reminders.

## Tech stack

- **Frontend:** React (Vite)
- **Backend:** Node.js + Express
- **Database:** MongoDB (`lakshmi_ganapati`)

## Prerequisites

- [Node.js](https://nodejs.org/) (v18+)
- [MongoDB](https://www.mongodb.com/try/download/community) running locally, or a MongoDB Atlas connection string

## Setup

### Quick start (both servers)

From the project root (`finances` folder):

```bash
npm install
npm run seed
npm run dev
```

This starts **backend** (port 5000) and **frontend** (port 3000) together. Login will fail with "Request failed" if only the frontend is running.

### 1. Backend

```bash
cd backend
npm install
```

Copy `.env.example` to `.env` and set `MONGODB_URI` if needed.

Seed demo users and a sample client:

```bash
npm run seed
```

Start the API:

```bash
npm run dev
```

API runs at `http://localhost:5000`.

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`.

## Demo logins (after seed)

| Role     | Username | Password     |
|----------|----------|--------------|
| Manager  | manager  | manager123   |
| Customer | raju     | customer123  |

## Features

### Login page
- Choose **Customer** or **Manager**, then sign in with username and password.

### Customer dashboard
- Name, place, date amount was taken
- Amount taken, interest rate, interest amount
- Weekly payment amount
- Current week payment status
- Payment history table

### Manager dashboard
- **Add client:** name, place, phone, loan date, amount, interest %, weekly payment, login credentials
- **Weekly payments:** see who paid / not paid this week
- **Mark paid / unpaid** for each client
- **Send reminder** if weekly payment is pending (stores reminder; shows SMS preview — connect Twilio for real SMS)

## API overview

| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Login (body: `username`, `password`, `role`) |
| GET | `/api/customer/profile` | Customer loan details |
| GET | `/api/customer/payments` | Customer payment history |
| GET | `/api/manager/clients` | List clients |
| POST | `/api/manager/clients` | Add client |
| GET | `/api/manager/weekly-status` | This week’s payment status |
| PATCH | `/api/manager/payments/:id` | Mark paid/unpaid |
| POST | `/api/manager/send-reminder/:id` | Send payment reminder |

## Production notes

- Change `JWT_SECRET` in `.env`
- Use MongoDB Atlas for hosted database
- Integrate Twilio (or similar) in `routes/manager.js` `send-reminder` for real SMS
- Build frontend: `cd frontend && npm run build` and serve static files or deploy separately
