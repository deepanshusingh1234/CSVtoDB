import fs from "fs";
import csv from "csv-parser";

const INPUT_FILE = "./Visa Free Data from the Website 2-26-17 (3).csv";
const OUTPUT_FILE = "./visaFreeCountries1223.js";

const rows = [];
let headers = [];
let rowIndex = 0;

// Step 1: read CSV
fs.createReadStream(INPUT_FILE)
    .pipe(csv({ headers: false }))
    .on("data", (row) => {
        rowIndex++;
        if (rowIndex === 1) {
            headers = Object.values(row); // country names
        } else if (rowIndex === 2) {
            // ❌ skip "Country code / Freedom Index / Welcome Index" row
            return;
        } else {
            rows.push(row); // actual country data
        }
    })

    .on("end", () => {
        // Build country → population map
        const countryPopulation = {};
        rows.forEach((row) => {
            const values = Object.values(row);
            const country = values[0].trim();
            const population = parseFloat(values[values.length - 3]) || 0; // exact number from CSV
            countryPopulation[country] = population;
        });

        const result = {};
        const summaryData = [];

        // Build column index map for "To Country"
        const countryColumnIndex = {};
        headers.forEach((name, i) => {
            countryColumnIndex[name.trim()] = i;
        });

        // Build each country's JSON
        rows.forEach((row, idx) => {
            const values = Object.values(row);
            const fromCountry = values[0].trim();
            const code = values[1].trim();
            const population = parseFloat(values[values.length - 3]) || 0;
            const freedomIndex = values[values.length - 2].trim();
            const welcomeIndex = values[values.length - 1].trim();

            const citizensVisaFree = [];
            const citizensVisaRequired = [];

            // Loop through each country column (starts at index 2)
            for (let i = 2; i < values.length - 3; i++) {
                const allowed = parseInt(values[i]);
                const toCountry = headers[i].trim();
                const toPopulation = countryPopulation[toCountry] || 0;

                if (allowed === 1) citizensVisaFree.push({ country: toCountry, population: toPopulation });
                else if (allowed === 0) citizensVisaRequired.push({ country: toCountry, population: toPopulation });
            }

            // Ensure at least the country itself is in visa-free if none
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
                visaRequiredForVisitors: []
            };

            // Build summary data array
            summaryData.push({
                rank: idx + 1,
                country: fromCountry,
                code,
                population: population.toString(),
                freedomIndex,
                welcomeIndex
            });
        });

        // Step 2: Calculate visaFreeForVisitors and visaRequiredForVisitors
        // Step 2: Calculate visaFreeForVisitors and visaRequiredForVisitors
        rows.forEach((row) => {
            const values = Object.values(row);
            const fromCountry = values[0].trim();
            const fromPopulation = countryPopulation[fromCountry] || 0;

            for (let i = 2; i < values.length - 3; i++) {
                const allowed = parseInt(values[i]);
                const toCountry = headers[i]?.trim();

                // ✅ CRITICAL SAFETY CHECK
                if (!toCountry) continue;

                const target = result[toCountry.toLowerCase()];
                if (!target) continue; // skip non-country columns

                if (allowed === 1) {
                    target.visaFreeForVisitors.push({
                        country: fromCountry,
                        population: fromPopulation
                    });
                } else if (allowed === 0) {
                    target.visaRequiredForVisitors.push({
                        country: fromCountry,
                        population: fromPopulation
                    });
                }
            }
        });


        // Final JSON
        const finalOutput = {
            year: 2009,
            data: summaryData,
            countries: result
        };

        function toJsObject(obj, indent = 2) {
            const json = JSON.stringify(obj, null, indent);

            return json
                // remove quotes from object keys
                .replace(/"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, '$1:')
                // keep strings intact
                .replace(/\\"/g, '"');
        }

        // wrap in array as you want
        const jsOutput = `export const visaFreeCountries = [
${toJsObject(finalOutput, 2)}
];`;

        fs.writeFileSync(OUTPUT_FILE, jsOutput, "utf8");


        console.log("✅ visaFreeCountries.js generated successfully!");
    });
