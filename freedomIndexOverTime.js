import fs from "fs";
import csv from "csv-parser";

const INPUT_FILES = [
    { file: "./Visa Free Data from the Website 2-26-17.csv", year: 2006 },
    { file: "./Visa Free Data from the Website 2-26-17 (1).csv", year: 2007 },
    { file: "./Visa Free Data from the Website 2-26-17 (2).csv", year: 2008 },
    { file: "./Visa Free Data from the Website 2-26-17 (3).csv", year: 2009 },
];

const OUTPUT_FILE = "./visaFreeCountriesAllYears.js";

const visaFreeCountries = [];

function processCSV(filePath, year) {
    return new Promise((resolve, reject) => {
        const rows = [];
        let headers = [];
        let rowIndex = 0;

        fs.createReadStream(filePath)
            .pipe(csv({ headers: false }))
            .on("data", (row) => {
                rowIndex++;
                if (rowIndex === 1) {
                    headers = Object.values(row);
                } else if (rowIndex === 2) {
                    // Skip "Country code / Freedom Index / Welcome Index" row
                    return;
                } else {
                    rows.push(row);
                }
            })
            .on("end", () => {
                const countryPopulation = {};
                rows.forEach((row) => {
                    const values = Object.values(row);
                    const country = values[0].trim();
                    const population = parseFloat(values[values.length - 3]) || 0;
                    countryPopulation[country] = population;
                });

                const result = {};
                const summaryData = [];

                rows.forEach((row, idx) => {
                    const values = Object.values(row);
                    const fromCountry = values[0].trim();
                    const code = values[1].trim();
                    const population = parseFloat(values[values.length - 3]) || 0;
                    const freedomIndex = values[values.length - 2].trim();
                    const welcomeIndex = values[values.length - 1].trim();

                    const citizensVisaFree = [];
                    const citizensVisaRequired = [];

                    for (let i = 2; i < values.length - 3; i++) {
                        const allowed = parseInt(values[i]);
                        const toCountry = headers[i].trim();
                        const toPopulation = countryPopulation[toCountry] || 0;

                        if (allowed === 1) citizensVisaFree.push({ country: toCountry, population: toPopulation });
                        else if (allowed === 0) citizensVisaRequired.push({ country: toCountry, population: toPopulation });
                    }

                    if (citizensVisaFree.length === 0) {
                        citizensVisaFree.push({ country: fromCountry, population });
                    }

                    result[fromCountry.toLowerCase()] = {
                        name: fromCountry,
                        code,
                        visaFreeIndex: freedomIndex,
                        visaFreeWelcomeIndex: welcomeIndex,
                        citizensVisaFree,
                        citizensVisaRequired,
                        visaFreeForVisitors: [],
                        visaRequiredForVisitors: [],
                    };

                    summaryData.push({
                        rank: idx + 1,
                        country: fromCountry,
                        code,
                        population: population.toString(),
                        freedomIndex,
                        welcomeIndex,
                    });
                });

                // Calculate visaFreeForVisitors and visaRequiredForVisitors
                rows.forEach((row) => {
                    const values = Object.values(row);
                    const fromCountry = values[0].trim();
                    const fromPopulation = countryPopulation[fromCountry] || 0;

                    for (let i = 2; i < values.length - 3; i++) {
                        const allowed = parseInt(values[i]);
                        const toCountry = headers[i]?.trim();
                        if (!toCountry) continue;
                        const target = result[toCountry.toLowerCase()];
                        if (!target) continue;

                        if (allowed === 1) {
                            target.visaFreeForVisitors.push({ country: fromCountry, population: fromPopulation });
                        } else {
                            target.visaRequiredForVisitors.push({ country: fromCountry, population: fromPopulation });
                        }
                    }
                });

                resolve({
                    year,
                    data: summaryData,
                    countries: result,
                });
            })
            .on("error", reject);
    });
}

async function generateAllYears() {
    for (const file of INPUT_FILES) {
        const yearData = await processCSV(file.file, file.year);
        visaFreeCountries.push(yearData);
    }

    // Compute Freedom Index Over Time
    const freedomIndexOverTime = visaFreeCountries.map((yearObj) => {
        const total = yearObj.data.reduce((sum, country) => sum + parseFloat(country.freedomIndex) || 0, 0);
        const avg = total / yearObj.data.length;
        return { year: yearObj.year, freedomIndex: avg };
    });

    // Convert to JS without quotes for keys
    function toJsObject(obj, indent = 2) {
        const json = JSON.stringify(obj, null, indent);
        return json.replace(/"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, "$1:");
    }

    const jsOutput = `export const visaFreeCountries = ${toJsObject(visaFreeCountries, 2)};
export const freedomIndexOverTime = ${toJsObject(freedomIndexOverTime, 2)};`;

    fs.writeFileSync(OUTPUT_FILE, jsOutput, "utf8");
    console.log("✅ visaFreeCountriesAllYears.js generated with Freedom Index Over Time!");
}

generateAllYears();
