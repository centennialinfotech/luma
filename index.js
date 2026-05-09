import express from "express";
import sql from "mssql";

const app = express();

// ================= MIDDLEWARE =================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// ================= ENV VALIDATION =================
const requiredEnv = ["DB_USER", "DB_PASSWORD", "DB_SERVER", "DB_NAME"];

for (const key of requiredEnv) {
    if (!process.env[key]) {
        console.error(`❌ Missing env variable: ${key}`);
        process.exit(1);
    }
}

// ================= DB CONFIG =================
const dbConfig = {
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    server: process.env.DB_SERVER,
    database: process.env.DB_NAME,
    options: {
        encrypt: false,
        trustServerCertificate: true
    },
    pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30000
    }
};

let pool;

// ================= CONNECT DB =================
async function getPool() {
    if (!pool) {
        pool = await sql.connect(dbConfig);
        console.log("✅ DB Connected");
    }
    return pool;
}

// ================= CREATE TABLE (AUTO) =================
async function ensureTable() {
    const pool = await getPool();

    await pool.request().query(`
        IF NOT EXISTS (
            SELECT * FROM INFORMATION_SCHEMA.TABLES
            WHERE TABLE_NAME = 'city_discover'
        )
        BEGIN
            CREATE TABLE city_discover (
                city_slug NVARCHAR(255) PRIMARY KEY,
                event_discover_place_id NVARCHAR(255),
                calendar_discover_place_id NVARCHAR(255)
            )
        END
    `);

    console.log("✅ Table ready");
}

// ================= HOME PAGE =================
app.get("/", async (req, res) => {

    const success = req.query.success;

    const pool = await getPool();

    const result = await pool.request().query(`
        SELECT * FROM city_discover
        ORDER BY city_slug
    `);

    const rows = result.recordset;

    const tableRows = rows.map(r => `
        <tr>
            <td>${r.city_slug}</td>
            <td>${r.event_discover_place_id || ""}</td>
            <td>${r.calendar_discover_place_id || ""}</td>
        </tr>
    `).join("");

    res.send(`
        <h2>Add City Discover Mapping</h2>

        ${success ? "<p style='color:green'>✅ Saved successfully</p>" : ""}

        <form method="POST" action="/add-city">
            <label>City Slug:</label><br>
            <input name="city_slug" required /><br><br>

            <label>Event Discover Place ID:</label><br>
            <input name="event_id" /><br><br>

            <label>Calendar Discover Place ID:</label><br>
            <input name="calendar_id" /><br><br>

            <button type="submit">Save</button>
        </form>

        <hr>

        <h3>Saved Cities</h3>

        <table border="1" cellpadding="8">
            <tr>
                <th>City</th>
                <th>Event Discover ID</th>
                <th>Calendar Discover ID</th>
            </tr>
            ${tableRows}
        </table>
    `);
});

// ================= SAVE DATA =================
app.post("/add-city", async (req, res) => {

    try {
        const { city_slug, event_id, calendar_id } = req.body;

        if (!city_slug) {
            return res.send("❌ city_slug required");
        }

        const pool = await getPool();

        await pool.request()
            .input("city_slug", sql.NVarChar(255), city_slug)
            .input("event_id", sql.NVarChar(255), event_id)
            .input("calendar_id", sql.NVarChar(255), calendar_id)
            .query(`
                MERGE city_discover AS target
                USING (SELECT @city_slug AS city_slug) AS source
                ON target.city_slug = source.city_slug

                WHEN MATCHED THEN
                    UPDATE SET
                        event_discover_place_id = @event_id,
                        calendar_discover_place_id = @calendar_id

                WHEN NOT MATCHED THEN
                    INSERT (city_slug, event_discover_place_id, calendar_discover_place_id)
                    VALUES (@city_slug, @event_id, @calendar_id);
            `);

        res.redirect("/");

    } catch (err) {
        console.error(err);
        res.send("❌ Error: " + err.message);
    }
});

// ================= START SERVER =================
const PORT = process.env.PORT || 3000;

app.listen(PORT, async () => {
    console.log(`🚀 Server running on port ${PORT}`);
    await ensureTable();
});
