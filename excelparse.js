import xlsx from 'xlsx';
import pkg from 'pg';

const { Pool } = pkg;

const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'visa_db',
    password: '123456',
    port: 5432,
});

const YEAR = 2006;
const EXCEL_FILE = `visa_Free_${YEAR}.xlsx`;

async function run() {
    const workbook = xlsx.readFile(EXCEL_FILE);
    const sheet = workbook.Sheets[workbook.SheetNames[0]];

    // Read raw rows (Excel-safe)
    const rows = xlsx.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null, // VERY IMPORTANT
        raw: true
    });

    console.log(`📄 Excel loaded: ${rows.length} rows`);

    // ---------------- ROW STRUCTURE ----------------
    // Row 0 → Country names
    // Row 1 → Country codes
    // Row 2+ → Data

    const headerRow = rows[0];

    // Build column → country map (skip first 2 cols)
    const countryColumnMap = {};
    for (let c = 2; c < headerRow.length; c++) {
        const country = headerRow[c];
        if (typeof country === 'string' && country.trim()) {
            countryColumnMap[country.trim()] = c;
        }
    }

    // ---------------- INSERT MATRIX ----------------
    for (let r = 2; r < rows.length; r++) {
        const row = rows[r];

        const fromCountry = row[0];
        if (!fromCountry) continue;

        for (const [toCountry, colIdx] of Object.entries(countryColumnMap)) {
            if (toCountry === fromCountry) continue;

            const cell = row[colIdx];

            // ✅ Excel-safe numeric check
            const visaFree = Number(cell) === 1;

            try {
                await pool.query(
                    `
                    INSERT INTO visa_matrix
                        (from_country_id, to_country_id, year_id, visa_free)
                    SELECT
                        fc.id,
                        tc.id,
                        y.id,
                        $1
                    FROM countries fc
                    JOIN countries tc ON tc.name = $3
                    JOIN years y ON y.year = $4
                    WHERE fc.name = $2
                    ON CONFLICT DO NOTHING
                    `,
                    [visaFree, fromCountry, toCountry, YEAR]
                );
            } catch (err) {
                console.error(
                    `❌ Insert failed: ${fromCountry} -> ${toCountry}`,
                    err.message
                );
            }
        }
    }

    console.log(`✅ Excel visa matrix imported correctly for ${YEAR}`);
    await pool.end();
}

run();
