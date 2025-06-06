const { processAllUserData } = require("./back-off");

(async () => {
    const allData = await processAllUserData("./data");
    console.log(allData);
})();
