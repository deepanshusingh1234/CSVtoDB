import fs from 'fs';
import csv from 'csv-parser';
import pkg from 'pg';

const { Pool } = pkg;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'visa_db',
    password: '123456',
    port: 5432,
});

const YEAR = 2014; // change per CSV
const CSV_FILE = `visa_${YEAR}.csv`; // path to CSV

// ---------------------- helper ----------------------
function parsePopulation(popStr) {
    if (!popStr) return 0;
    return Number(popStr.replace(/,/g, '')) || 0;
}

// ---------------------- main ----------------------
async function run() {
    const rows = [];

    // Step 1: Read CSV
    fs.createReadStream(CSV_FILE)
        .pipe(csv({ headers: false, skipEmptyLines: true }))
        .on('data', (row) => rows.push(Object.values(row)))
        .on('end', async () => {
            console.log(`📄 CSV loaded: ${rows.length} rows`);

            // Step 2: Compute total world population for this year
            let worldPopulation = 0;
            for (let r = 2; r < rows.length; r++) {
                const values = rows[r];
                const popStr = values[values.length - 3]?.trim() || '0';
                const population = parsePopulation(popStr);
                worldPopulation += population;
            }
            console.log(`🌎 Total world population for ${YEAR}: ${worldPopulation}`);

            // Step 3: Loop over countries and insert/update
            for (let r = 2; r < rows.length; r++) {
                const values = rows[r];
                const countryName = values[0]?.trim();
                const countryCode = values[1]?.trim();

                if (!countryName || !countryCode) continue;

                const population = parsePopulation(values[values.length - 3]?.trim());
                const freedomIndex = values[values.length - 2]?.trim() || '';
                const welcomeIndex = values[values.length - 1]?.trim() || '';

                const worldPopulationIndex =
                    worldPopulation > 0 ? ((population / worldPopulation) * 100).toFixed(2) : '0';

                try {
                    // Get country id
                    const countryRes = await pool.query(
                        `SELECT id FROM countries WHERE name = $1 OR code = $2`,
                        [countryName, countryCode]
                    );
                    if (countryRes.rowCount === 0) {
                        console.warn(`⚠️ Country not found in DB: ${countryName}`);
                        continue;
                    }
                    const countryId = countryRes.rows[0].id;

                    // Get year id
                    const yearRes = await pool.query(`SELECT id FROM years WHERE year = $1`, [YEAR]);
                    if (yearRes.rowCount === 0) {
                        console.warn(`⚠️ Year not found in DB: ${YEAR}`);
                        continue;
                    }
                    const yearId = yearRes.rows[0].id;

                    // Insert or update
                    await pool.query(
                        `
            INSERT INTO country_year_index_data 
              (country_id, year, population, freedom_index, welcome_index, world_population_index)
            VALUES ($1, $2, $3, $4, $5, $6)
            ON CONFLICT (country_id, year) DO UPDATE
            SET population = EXCLUDED.population,
                freedom_index = EXCLUDED.freedom_index,
                welcome_index = EXCLUDED.welcome_index,
                world_population_index = EXCLUDED.world_population_index;
            `,
                        [countryId, YEAR, population, freedomIndex, welcomeIndex, worldPopulationIndex]
                    );
                } catch (err) {
                    console.error(`❌ Failed insert/update for ${countryName}:`, err.message);
                }
            }

            console.log(`✅ Country year index data imported for ${YEAR}`);
            pool.end();
        });
}

run();
