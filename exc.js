import fs from 'fs';
import csv from 'csv-parser';
import pkg from 'pg';

const { Pool } = pkg;

// ------------------ POSTGRES CONFIG ------------------
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'visa_db',
    password: '123456',
    port: 5432,
});

// ------------------ SETTINGS ------------------
const YEAR = 2006;
const CSV_FILE = `visa_${YEAR}.csv`;

async function run() {
    const rows = [];

    // ------------------ READ CSV ------------------
    fs.createReadStream(CSV_FILE)
        .pipe(csv({ skipEmptyLines: true, strict: true }))
        .on('data', (row) => rows.push(row))
        .on('end', async () => {
            console.log(`📄 CSV loaded: ${rows.length} rows`);

            if (rows.length < 2) {
                console.error('❌ CSV seems too short');
                return;
            }

            // ------------------ HEADERS ------------------
            const headers = Object.values(rows[0]).map(h => h?.trim());
            const countryColumnMap = {};
            headers.forEach((country, idx) => {
                if (idx >= 2 && country) countryColumnMap[country] = idx;
            });

            // ------------------ POPULATION MAP ------------------
            const countryPopulation = {};
            rows.forEach((row, idx) => {
                if (idx < 2) return; // skip headers + metadata
                const values = Object.values(row).map(v => (v ? v.trim() : '0'));
                const country = values[0];
                const population = values[values.length - 3] || '0';
                countryPopulation[country] = population;
            });

            // ------------------ CACHE COUNTRY IDS ------------------
            const res = await pool.query('SELECT id, name FROM countries');
            const countryIdMap = {};
            res.rows.forEach(row => {
                countryIdMap[row.name] = row.id;
            });

            // ------------------ CACHE YEAR ID ------------------
            const yearRes = await pool.query('SELECT id FROM years WHERE year = $1', [YEAR]);
            if (yearRes.rows.length === 0) {
                console.error(`❌ Year ${YEAR} not found in DB`);
                return;
            }
            const yearId = yearRes.rows[0].id;

            // ------------------ INSERT DATA ------------------
            for (let r = 2; r < rows.length; r++) {
                const row = rows[r];
                const values = Object.values(row).map(v => (v ? v.trim() : ''));

                const fromCountry = values[0];
                const fromId = countryIdMap[fromCountry];
                if (!fromId) {
                    console.warn(`⚠️ From country not found: ${fromCountry}`);
                    continue;
                }

                for (const [toCountry, colIdx] of Object.entries(countryColumnMap)) {
                    if (toCountry === fromCountry) continue;

                    const toId = countryIdMap[toCountry];
                    if (!toId) {
                        console.warn(`⚠️ To country not found: ${toCountry}`);
                        continue;
                    }

                    let cellValue = values[colIdx];
                    if (cellValue === undefined || cellValue === '') continue;

                    cellValue = Number(cellValue);
                    const visaFree = cellValue === 1;

                    try {
                        await pool.query(
                            `
                            INSERT INTO visa_matrix
                                (from_country_id, to_country_id, year_id, visa_free)
                            VALUES ($1, $2, $3, $4)
                            ON CONFLICT DO NOTHING
                            `,
                            [fromId, toId, yearId, visaFree]
                        );
                    } catch (err) {
                        console.error(
                            `❌ Insert failed: ${fromCountry} -> ${toCountry}`,
                            err.message
                        );
                    }
                }
            }

            console.log(`✅ Visa matrix imported correctly for ${YEAR}`);
            await pool.end();
        });
}

run();
