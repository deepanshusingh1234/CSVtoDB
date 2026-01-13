import fs from "fs";
import csv from "csv-parser";

const INPUT_FILE = "./visa_2009.csv";
const OUTPUT_FILE = "./visaFreeCountries_final81.js";

const rows = [];
let headers = [];
let rowIndex = 0;

// ------------------ READ CSV ------------------
fs.createReadStream(INPUT_FILE)
    .pipe(csv({ headers: false }))
    .on("data", (row) => {
        rowIndex++;
        if (rowIndex === 1) {
            headers = Object.values(row); // country names
        } else if (rowIndex === 2) {
            return; // skip metadata row
        } else {
            rows.push(row);
        }
    })

    .on("end", () => {

        // ------------------ POPULATION MAP (STRING, EXACT) ------------------
        const countryPopulation = {};
        rows.forEach((row) => {
            const values = Object.values(row);
            const country = values[0].trim();
            const population = values[values.length - 3]?.trim() || "0";
            countryPopulation[country] = population;
        });

        const countries = {};
        const summaryData = [];

        // ------------------ BUILD EACH COUNTRY ------------------
        rows.forEach((row, idx) => {
            const values = Object.values(row);

            const fromCountry = values[0].trim();
            const code = values[1].trim();
            const population = values[values.length - 3]?.trim() || "0";
            const freedomIndex = values[values.length - 2]?.trim() || "";
            const welcomeIndex = values[values.length - 1]?.trim() || "";

            const citizensVisaFree = [];
            const citizensVisaRequired = [];

            for (let i = 2; i < values.length - 3; i++) {
                const allowed = Number(values[i]);
                const toCountry = headers[i]?.trim();
                if (!toCountry || toCountry === fromCountry) continue;

                const toPopulation = countryPopulation[toCountry] || "0";

                if (allowed === 1) {
                    citizensVisaFree.push({ country: toCountry, population: toPopulation });
                } else if (allowed === 0) {
                    citizensVisaRequired.push({ country: toCountry, population: toPopulation });
                }
            }

            countries[fromCountry.toLowerCase()] = {
                name: fromCountry,
                code,
                visaFreeIndex: freedomIndex,
                visaFreeWelcomeIndex: welcomeIndex,
                citizensVisaFree,
                citizensVisaRequired,
                visaFreeForVisitors: [],
                visaRequiredForVisitors: []
            };

            summaryData.push({
                rank: idx + 1,
                country: fromCountry,
                code,
                population,
                freedomIndex,
                welcomeIndex
            });
        });

        // ------------------ VISITORS LOGIC ------------------
        rows.forEach((row) => {
            const values = Object.values(row);
            const fromCountry = values[0].trim();
            const fromPopulation = countryPopulation[fromCountry] || "0";

            for (let i = 2; i < values.length - 3; i++) {
                const allowed = Number(values[i]);
                const toCountry = headers[i]?.trim();

                if (!toCountry || toCountry === fromCountry) continue;

                const target = countries[toCountry.toLowerCase()];
                if (!target) continue;

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

        // ------------------ FINAL OUTPUT ------------------
        const finalOutput = {
            year: 2006,
            data: summaryData,
            countries
        };

        function toJsObject(obj, indent = 2) {
            return JSON.stringify(obj, null, indent)
                .replace(/"([a-zA-Z_$][a-zA-Z0-9_$]*)":/g, "$1:")
                .replace(/\\"/g, '"');
        }

        const jsOutput = `export const visaFreeCountries = [
${toJsObject(finalOutput, 2)}
];`;

        fs.writeFileSync(OUTPUT_FILE, jsOutput, "utf8");

        console.log("✅ visaFreeCountries generated with EXACT population values");
    });
