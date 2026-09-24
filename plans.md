# Project plan

## 1. Project objective

Build a small web demo that teaches SQL injection mitigation by contrasting unsafe SQL construction with prepared statements.

## 2. Scope

The project is intentionally small and focused. It should show the mitigation skeleton clearly rather than acting like a production application.

## 3. Backend plan

### Tasks

- initialize Node.js project
- add Express server
- create SQLite database with seeded users
- expose endpoints for demo interactions
- create one vulnerable route and one safe route
- keep response formats readable for frontend display

### Backend routes

- GET /api/health
- POST /api/login-demo
- GET /api/search-demo

### Security behavior

- vulnerable route: concatenate input directly into SQL string
- safe route: use parameterized statement with placeholders
- validate required fields before execution

## 4. Frontend plan

### UI goals

- show user input fields clearly
- render safe and unsafe output in separate panels
- include common injection payload presets
- explain mitigation steps visually

### UI sections

- header with project title
- login form
- comparison cards for safe vs unsafe results
- search comparison section
- checklist for mitigation principles

## 5. Demo story

The app should walk a user through this flow:

1. enter a username/password
2. choose a payload or use default values
3. run safe login and vulnerable login
4. compare query behavior
5. learn the exact mitigation pattern

## 6. Mitigation skeleton to teach

- trust boundary: request data enters application
- input validation: reject empty or malformed entries
- parameter binding: use placeholders instead of string building
- database execution: DB receives value, not SQL logic
- result handling: return safe subset of data only

## 7. Test plan

- run normal login successfully
- test injection string in vulnerable route
- ensure safe route blocks or rejects malicious input
- test search demo with common payload patterns
- verify app runs locally without crashes

## 8. GitHub and repo setup

- initialize git repository
- create repo README and docs
- commit starter project files
- create GitHub repository if GitHub auth is available
- push initial repo state to remote

## 9. Final milestone

Deliver a minimal but complete demo app showing:

- why SQL injection is dangerous
- how parameterized queries mitigate it
- how a web app can teach security in an accessible way

## 10. Recommended final project name

SQLShield Demo
