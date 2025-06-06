const fs = require("fs");
const csv = require("csv-parser");
const path = require("path");
const { createObjectCsvWriter } = require("csv-writer");

// Configuration
const MIN_BACKOFF_MINUTES = 60 * 24;
const MAX_BACKOFF_HOURS = 3 * 24;
const BACKOFF_MULTIPLIER = 2;
const SUCCESS_THRESHOLD = 1; // Minimum number of jobs to consider a search successful
const PRIORITY_PLANS = [1, 2, 3]; // Higher tier subscription plans (ordered by priority)

//Main function that processes all user search data files

async function processAllUserData(directoryPath) {
    try {
        // Read all CSV files in the directory
        const files = fs.readdirSync(directoryPath).filter((file) => file.endsWith(".csv"));
        console.log(files);
        // Parse and collect all search data
        const allSearchData = [];
        for (const file of files) {
            const userData = await parseCSVFile(path.join(directoryPath, file));
            console.log(userData);
            allSearchData.push(...userData);
        }

        // Process the search data and apply the exponential backoff algorithm
        const optimizedSearches = applyExponentialBackoff(allSearchData);

        // Save the optimized search schedule
        await saveOptimizedSchedule(optimizedSearches, path.join(directoryPath, "optimized_schedule.csv"));

        console.log(`Successfully processed ${allSearchData.length} search records.`);
        console.log(`Generated optimized search schedule with ${optimizedSearches.length} entries.`);

        // Generate analytics
        analyzeSearchEfficiency(allSearchData);
    } catch (error) {
        console.error("Error processing search data:", error);
    }
}

//Parse a CSV file and return the data as an array of objects

function parseCSVFile(filePath) {
    return new Promise((resolve, reject) => {
        const results = [];

        fs.createReadStream(filePath)
            .pipe(csv())
            .on("data", (data) => results.push(data))
            .on("end", () => resolve(results))
            .on("error", (error) => reject(error));
    });
}

//Apply exponential backoff algorithm to search data

function applyExponentialBackoff(searchData) {
    // Group searches by user, search query, and platform
    const searchGroups = groupSearches(searchData);

    // Calculate success rate for each search group
    const searchStats = calculateSearchStats(searchGroups);

    // Apply exponential backoff based on success rates
    const optimizedSearches = [];

    for (const key in searchStats) {
        const stats = searchStats[key];
        const [userId, jobTitle, jobLocation, jobType, remote, platform, pricingPlan] = key.split("||");

        // Calculate next search time based on backoff algorithm
        const nextSearchTime = calculateNextSearchTime(stats);
        // Add to optimized searches
        optimizedSearches.push({
            userId,
            jobTitle,
            jobLocation,
            jobType,
            remote,
            platform,
            pricingPlan: parseInt(pricingPlan),
            //nextSearchTime,
            successRate: stats.successRate,
            totalSearches: stats.totalSearches,
            totalJobs: stats.totalJobs,
            priority: calculatePriority(parseInt(pricingPlan), stats.successRate),
            recentSearches: stats.recentSearches,
            runToday: calculateNextSearchTime(stats) ? "Yes" : "No",
        });
    }

    // Sort by priority (higher priority first)
    return optimizedSearches.sort((a, b) => b.priority - a.priority);
}

//Group search data by user, search query, and platform

function groupSearches(searchData) {
    const groups = {};

    searchData.forEach((search) => {
        // Create a unique key for each search group
        const key = [
            search.userId,
            search.jobTitle,
            search.jobLocation,
            search.jobType,
            search.remote,
            search.platform,
            search.pricingPlan,
        ].join("||");

        if (!groups[key]) {
            groups[key] = [];
        }

        groups[key].push({
            createdAt: new Date(search.createdAt),
            totalJobs: parseInt(search.totalJobs || 0),
            newJobs: parseInt(search.newJobs || 0),
            timeTaken: parseFloat(search.timeTaken || 0),
        });
    });

    return groups;
}

//Calculate search statistics for each search group
function calculateSearchStats(searchGroups) {
    const stats = {};

    for (const key in searchGroups) {
        const searches = searchGroups[key];

        // Sort searches by date (newest first)
        searches.sort((a, b) => b.createdAt - a.createdAt);

        // Calculate statistics
        const totalSearches = searches.length;
        const totalJobs = searches.reduce((sum, search) => sum + search.totalJobs, 0);
        const successfulSearches = searches.filter((search) => search.totalJobs >= SUCCESS_THRESHOLD).length;
        const successRate = totalSearches > 0 ? successfulSearches / totalSearches : 0;
        const lastSearchTime = searches[0]?.createdAt || new Date();
        const consecutiveFailures = getConsecutiveFailures(searches);

        stats[key] = {
            totalSearches,
            totalJobs,
            successRate,
            lastSearchTime,
            consecutiveFailures,
            recentSearches: searches.slice(0, 10), // Keep the 10 most recent searches
        };
    }

    return stats;
}

//Count consecutive failures (searches with 0 jobs found)

function getConsecutiveFailures(searches) {
    let count = 0;

    for (const search of searches) {
        if (search.totalJobs < SUCCESS_THRESHOLD) {
            count++;
        } else {
            break;
        }
    }

    return count;
}

//Calculate next search time based on exponential backoff

function calculateNextSearchTime(stats) {
    const baseTime = stats.lastSearchTime ? new Date(stats.lastSearchTime) : new Date();

    let nextSearchTime;
    if (stats.successRate > 0.7) {
        nextSearchTime = new Date(baseTime.getTime() + 60 * 60 * 1000);
    } else {
        const backoffMinutes = Math.min(
            MIN_BACKOFF_MINUTES * Math.pow(BACKOFF_MULTIPLIER, stats.consecutiveFailures),
            MAX_BACKOFF_HOURS * 60
        );
        nextSearchTime = new Date(baseTime.getTime() + backoffMinutes * 60 * 1000);
    }

    const today = new Date();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);

    return nextSearchTime < tomorrow;
}

//Calculate priority score for a search

function calculatePriority(pricingPlan, successRate) {
    // Base priority based on pricing plan
    let priority = 0;

    // Higher tier plans get higher priority
    if (PRIORITY_PLANS.includes(pricingPlan)) {
        priority += (PRIORITY_PLANS.indexOf(pricingPlan) + 1) * 100;
    }

    // Add priority based on success rate
    priority += successRate * 50;

    return priority;
}

//Save optimized search schedule to CSV file
async function saveOptimizedSchedule(optimizedSearches, outputPath) {
    optimizedSearches.sort((a, b) => {
        let cmp = a.jobTitle.localeCompare(b.jobTitle);
        if (cmp === 0) {
            cmp = a.jobLocation.localeCompare(b.jobLocation);
        }
        if (cmp === 0) {
            cmp = a.platform.localeCompare(b.platform);
        }
        return cmp;
    });

    const csvWriter = createObjectCsvWriter({
        path: outputPath,
        header: [
            { id: "userId", title: "User ID" },
            { id: "jobTitle", title: "Job Title" },
            { id: "jobLocation", title: "Job Location" },
            { id: "jobType", title: "Job Type" },
            { id: "remote", title: "Remote" },
            { id: "platform", title: "Platform" },
            { id: "pricingPlan", title: "Pricing Plan" },
            { id: "runToday", title: "Run Today" },
            //{ id: "nextSearchTime", title: "Next Search Time" },
            { id: "successRate", title: "Success Rate" },
            { id: "totalSearches", title: "Total Searches" },
            { id: "totalJobs", title: "Total Jobs Found" },
            { id: "priority", title: "Priority Score" },
            { id: "recentSearches", title: "Recent Searches" },
        ],
    });

    // Format dates before writing
    const formattedData = optimizedSearches.map((search) => ({
        ...search,
        //nextSearchTime: search.nextSearchTime.toISOString(),
        successRate: search.successRate.toFixed(2),
        recentSearches: JSON.stringify(search.recentSearches || []),
    }));

    await csvWriter.writeRecords(formattedData);
}

//Analyze search efficiency and print statistics

function analyzeSearchEfficiency(searchData) {
    // Count total searches with zero results
    const zeroResultSearches = searchData.filter((search) => parseInt(search.totalJobs || 0) === 0).length;

    // Calculate percentage
    const zeroResultPercentage = ((zeroResultSearches / searchData.length) * 100).toFixed(2);

    console.log("\n--- Search Efficiency Analysis ---");
    console.log(`Total searches analyzed: ${searchData.length}`);
    console.log(`Searches with zero results: ${zeroResultSearches} (${zeroResultPercentage}%)`);

    // Group by platform and count zero results
    const platformStats = {};
    searchData.forEach((search) => {
        const platform = search.platform;
        if (!platformStats[platform]) {
            platformStats[platform] = { total: 0, zeros: 0 };
        }

        platformStats[platform].total++;
        if (parseInt(search.totalJobs || 0) === 0) {
            platformStats[platform].zeros++;
        }
    });

    console.log("\nZero results by platform:");
    for (const platform in platformStats) {
        const stats = platformStats[platform];
        const percentage = ((stats.zeros / stats.total) * 100).toFixed(2);
        console.log(`${platform}: ${stats.zeros}/${stats.total} (${percentage}%)`);
    }
}

// Export functions for use in other modules
module.exports = {
    processAllUserData,
    applyExponentialBackoff,
    calculateNextSearchTime,
};

// Example usage
// processAllUserData('./data');
