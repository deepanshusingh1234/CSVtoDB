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

const YEAR = 2014;
const CSV_FILE = `visa_${YEAR}.csv`;

async function run() {
    const client = await pool.connect();

    try {
        const rows = [];

        fs.createReadStream(CSV_FILE)
            .pipe(csv({ headers: false, skipEmptyLines: true }))
            .on('data', (row) => rows.push(row))
            .on('end', async () => {
                console.log(`📄 CSV loaded: ${rows.length} rows`);

                // ---------------- HEADER ROW ----------------
                const headers = Object.values(rows[0]).map((h) => h?.trim());
                const countryColumnMap = {};
                headers.forEach((country, idx) => {
                    if (idx >= 2 && country) {
                        countryColumnMap[country] = idx;
                    }
                });

                // ---------------- START TRANSACTION ----------------
                await client.query('BEGIN');

                // Delete old visa_matrix rows for this year
                await client.query(
                    `DELETE FROM visa_matrix 
           WHERE year_id = (SELECT id FROM years WHERE year = $1)`,
                    [YEAR]
                );

                // ---------------- DATA ROWS ----------------
                for (let r = 2; r < rows.length; r++) {
                    const values = Object.values(rows[r]).map((v) =>
                        typeof v === 'string' ? v.trim() : v
                    );

                    const fromCountry = values[0];
                    if (!fromCountry) continue;

                    for (const [toCountry, colIdx] of Object.entries(countryColumnMap)) {
                        if (toCountry === fromCountry) continue;

                        const cellValue = Number(values[colIdx]);
                        const visaFree = cellValue === 1;

                        await client.query(
                            `
              INSERT INTO visa_matrix
                (from_country_id, to_country_id, year_id, visa_free)
              SELECT fc.id, tc.id, y.id, $1
              FROM countries fc
              JOIN countries tc ON tc.name = $2
              JOIN years y ON y.year = $3
              WHERE fc.name = $4
              `,
                            [visaFree, toCountry, YEAR, fromCountry]
                        );
                    }
                }

                // ---------------- COMMIT ----------------
                await client.query('COMMIT');

                console.log(`✅ Visa matrix imported correctly for ${YEAR}`);
                client.release();
                await pool.end();
            });
    } catch (err) {
        console.error('❌ Import failed:', err.message);
        await client.query('ROLLBACK');
        client.release();
        await pool.end();
    }
}

run();
