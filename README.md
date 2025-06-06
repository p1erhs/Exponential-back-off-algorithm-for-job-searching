# Job Search Optimizer

A Node.js CLI tool that reads CSV logs of user job searches, groups them by user and query, calculates success rates and consecutive failures, and applies an exponential backoff algorithm to schedule next searches. It outputs an `optimized_schedule.csv` with “Run Today” flags and prints simple analytics on zero‐result searches.

## Prerequisites

- Node.js v14+  
- Directory of CSV files. Each CSV must include columns:  
  `userId,jobTitle,jobLocation,jobType,remote,platform,pricingPlan,createdAt,totalJobs,newJobs,timeTaken`

## Installation

```bash
git clone https://github.com/username/job-search-optimizer.git
cd job-search-optimizer
npm install
```

## Usage

1. Place all user CSV files in a folder (e.g. `./data/`).  
2. Edit `index.js` to point to your data folder:
   ```js
   const { processAllUserData } = require("./src/scripts/jobSearchOptimizer");
   processAllUserData("./data");
   ```
3. Run:
   ```bash
   node index.js
   ```
   - Reads all `*.csv` in `./data/`  
   - Generates `./data/optimized_schedule.csv` sorted by priority  
   - Prints analytics: total searches, zero‐result count, breakdown by platform

## Configuration

In `src/scripts/jobSearchOptimizer.js` adjust as needed:
```js
const MIN_BACKOFF_MINUTES = 60 * 24;   // base delay after failure (minutes)
const MAX_BACKOFF_HOURS = 3 * 24;      // cap on delay (hours)
const BACKOFF_MULTIPLIER = 2;          // exponential factor
const SUCCESS_THRESHOLD = 1;           // jobs ≥ this is “successful”
const PRIORITY_PLANS = [1, 2, 3];      // subscription plans with higher priority
```

## Output

`optimized_schedule.csv` includes:
```
User ID,Job Title,Job Location,Job Type,Remote,Platform,Pricing Plan,
Run Today,Success Rate,Total Searches,Total Jobs Found,Priority Score,Recent Searches
```
- **Run Today**: “Yes” if next search should run before tomorrow midnight.  
- **Recent Searches**: JSON‐encoded array of up to 10 most recent entries.

```
