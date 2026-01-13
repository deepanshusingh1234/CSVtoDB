import fs from 'fs'
import csv from 'csv-parser'
import pkg from 'pg'

const { Pool } = pkg
const pool = new Pool({
    user: 'postgres',
    host: 'localhost',
    database: 'visa_db',
    password: '123456',
    port: 5432,
})

const CSV_FILE = 'visa_2006.csv'

async function run() {
    const rows = []

    // Step 1: read all CSV rows
    fs.createReadStream(CSV_FILE)
        .pipe(csv({ headers: false }))
        .on('data', (row) => rows.push(Object.values(row)))
        .on('end', async () => {
            console.log('Rows read:', rows.length)

            const seen = new Set()

            for (const values of rows) {
                const name = values[0]?.trim()
                const code = values[1]?.trim()
                const populationRaw = values[values.length - 3]?.trim()

                if (!name || !code || seen.has(name)) continue
                seen.add(name)

                // Convert population to number
                const population = populationRaw ? Number(populationRaw) : 0

                try {
                    await pool.query(
                        `
            INSERT INTO countries (name, code, population)
            VALUES ($1, $2, $3)
            ON CONFLICT (name) DO NOTHING
          `,
                        [name, code, population]
                    )
                } catch (err) {
                    console.error('Insert failed:', name, err.message)
                }
            }

            console.log('✅ Countries imported correctly')
            pool.end()
        })
}

run()
