# SQLShield Demo

A lightweight web demo project for learning and demonstrating SQL injection mitigation techniques.

## Project goal

This project shows a clear side-by-side comparison between:

- unsafe SQL built by string concatenation
- safe SQL executed with parameterized queries

The goal is to teach the mitigation skeleton in a simple, visual, and interactive format without building a large production application.

## Why this project matters

SQL injection happens when untrusted user input is concatenated into SQL statements. A safe pattern keeps user input as data values rather than executable SQL.

## Core idea

- unsafe pattern: `SELECT * FROM users WHERE username = '${username}' AND password = '${password}'`
- safe pattern: `SELECT * FROM users WHERE username = ? AND password = ?`

The demo highlights this difference and shows how parameterized queries block malicious payloads.

## Features

- login demo with safe vs vulnerable logic
- payload presets for common SQL injection attempts
- search comparison showing safe and unsafe query behavior
- mitigation checklist for defensive coding practices
- simple SQLite-backed demo data

## Tech stack

- Node.js
- Express
- SQLite3
- HTML
- CSS
- JavaScript

## Project structure

```text
.
├── README.md
├── plans.md
├── package.json
├── server.js
├── public/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── database.sqlite
└── .gitignore
```

## Run locally

```bash
npm install
npm start
```

Then open:

```text
http://localhost:3000
```

## Security focus

This project emphasizes:

- prepared statements
- input validation
- least privilege access
- safe database query construction
- demonstration of common injection payloads

## Suggested naming options

- SQLShield Demo
- SecureQuery Lab
- InjectionGuard Demo
- SafeSQL Showcase
- QueryGuard

The chosen project name for this repo is: SQLShield Demo
