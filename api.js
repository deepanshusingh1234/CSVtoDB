import express from "express";
import pkg from "pg";
import cors from "cors";

const { Pool } = pkg;

/* ===================== DATABASE ===================== */

const pool = new Pool({
    user: "postgres",
    host: "localhost",
    database: "visa_db",
    password: "123456",
    port: 5432,
    max: 20,                // production-ready pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
});

/* ===================== APP ===================== */

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

/* ====================================================
   1️⃣ GET ALL COUNTRIES SUMMARY FOR A YEAR
==================================================== */

app.get("/api/visa/:year", async (req, res) => {
    const { year } = req.params;

    try {
        const { rows } = await pool.query(
            `
            SELECT
                c.id,
                c.name,
                c.code,
                cy.population,
                cy.freedom_index,
                cy.welcome_index
            FROM countries c
            LEFT JOIN country_year_index_data cy
              ON cy.country_id = c.id
             AND cy.year = $1
            ORDER BY c.name
            `,
            [year]
        );

        const data = rows.map((r, idx) => ({
            rank: idx + 1,
            country: r.name,
            code: r.code,
            population: r.population || "",
            freedomIndex: r.freedom_index || "",
            welcomeIndex: r.welcome_index || "",
        }));

        res.json({ year: Number(year), data });
    } catch (err) {
        console.error("Summary error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

/* ====================================================
   2️⃣ GET FULL VISA DATA FOR A COUNTRY + YEAR
==================================================== */

app.get("/api/visa/:year/:countryCode", async (req, res) => {
    const { year, countryCode } = req.params;

    try {
        /* ---------- WORLD POPULATION ---------- */
        const worldRes = await pool.query(
            `SELECT world_population FROM years WHERE year = $1`,
            [year]
        );

        const worldPopulation = worldRes.rowCount
            ? Number(worldRes.rows[0].world_population)
            : 0;

        /* ---------- COUNTRY INFO ---------- */
        const countryRes = await pool.query(
            `
            SELECT
                c.id,
                c.name,
                c.code,
                cy.population,
                cy.freedom_index,
                cy.welcome_index
            FROM countries c
            LEFT JOIN country_year_index_data cy
              ON cy.country_id = c.id
             AND cy.year = $1
            WHERE c.code = $2
            `,
            [year, countryCode]
        );

        if (!countryRes.rowCount) {
            return res.status(404).json({ error: "Country not found" });
        }

        const country = countryRes.rows[0];

        const countryPopulation = Number(country.population || 0);
        const world_population_index = worldPopulation
            ? ((countryPopulation / worldPopulation) * 100).toFixed(2) + " %"
            : "";

        /* ====================================================
           CITIZENS TRAVELING ABROAD
        ==================================================== */

        const citizensRes = await pool.query(
            `
            SELECT
                tc.name AS to_country,
                cy.population,
                vm.visa_free
            FROM visa_matrix vm
            JOIN countries fc ON fc.id = vm.from_country_id
            JOIN countries tc ON tc.id = vm.to_country_id
            LEFT JOIN country_year_index_data cy
              ON cy.country_id = tc.id
             AND cy.year = $1
            JOIN years y ON y.id = vm.year_id
            WHERE fc.code = $2
              AND y.year = $1
            `,
            [year, countryCode]
        );

        const citizensVisaFree = [];
        const citizensVisaRequired = [];

        for (const r of citizensRes.rows) {
            const pop = Number(r.population || 0);
            const wpIndex = worldPopulation
                ? ((pop / worldPopulation) * 100).toFixed(2) + " %"
                : "";

            const entry = {
                country: r.to_country,
                population: r.population || "",
                world_population_index: wpIndex,
            };

            r.visa_free
                ? citizensVisaFree.push(entry)
                : citizensVisaRequired.push(entry);
        }

        /* ====================================================
           VISITORS COMING INTO THIS COUNTRY
        ==================================================== */
        console.log(`Fetching visitors data for ${countryCode} in ${year}`);
        const visitorsRes = await pool.query(
            `
            SELECT
                fc.name AS from_country,
                cy.population,
                vm.visa_free
            FROM visa_matrix vm
            JOIN countries fc ON fc.id = vm.from_country_id
            JOIN countries tc ON tc.id = vm.to_country_id
            LEFT JOIN country_year_index_data cy
              ON cy.country_id = fc.id
             AND cy.year = $1
            JOIN years y ON y.id = vm.year_id
            WHERE tc.code = $2
              AND y.year = $1
            `,
            [year, countryCode]
        );

        const visaFreeForVisitors = [];
        const visaRequiredForVisitors = [];

        for (const r of visitorsRes.rows) {
            const pop = Number(r.population || 0);
            const wpIndex = worldPopulation
                ? ((pop / worldPopulation) * 100).toFixed(2) + " %"
                : "";

            const entry = {
                country: r.from_country,
                population: r.population || "",
                world_population_index: wpIndex,
            };

            r.visa_free
                ? visaFreeForVisitors.push(entry)
                : visaRequiredForVisitors.push(entry);
        }

        /* ---------- FINAL RESPONSE ---------- */
        res.json({
            year: Number(year),
            data: [
                {
                    rank: 1,
                    country: country.name,
                    code: country.code,
                    population: country.population || "",
                    freedomIndex: country.freedom_index || "",
                    welcomeIndex: country.welcome_index || "",
                    world_population_index,
                },
            ],
            countries: {
                [country.name.toLowerCase()]: {
                    name: country.name,
                    code: country.code,
                    population: country.population || "",
                    freedomIndex: country.freedom_index || "",
                    welcomeIndex: country.welcome_index || "",
                    world_population_index,
                    citizensVisaFree,
                    citizensVisaRequired,
                    visaFreeForVisitors,
                    visaRequiredForVisitors,
                },
            },
        });
    } catch (err) {
        console.error("Country API error:", err);
        res.status(500).json({ error: "Internal server error" });
    }
});

/* ===================== SERVER ===================== */

app.listen(PORT, () => {
    console.log(`✅ Visa API running at http://localhost:${PORT}`);
});
