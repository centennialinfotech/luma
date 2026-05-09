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
<!DOCTYPE html>
<html>
<head>
    <title>City Discover Mapping</title>
    <meta name="viewport" content="width=device-width, initial-scale=1.0"/>

    <style>
        body {
            font-family: Arial, sans-serif;
            background: #f5f7fb;
            margin: 0;
            padding: 20px;
        }

        .container {
            max-width: 900px;
            margin: auto;
            background: #fff;
            padding: 25px;
            border-radius: 10px;
            box-shadow: 0 5px 20px rgba(0,0,0,0.08);
        }

        h2 {
            margin-top: 0;
            color: #333;
        }

        .success {
            background: #e6ffed;
            color: #1a7f37;
            padding: 10px;
            border-radius: 6px;
            margin-bottom: 15px;
        }

        form {
            display: grid;
            grid-template-columns: 1fr;
            gap: 10px;
            margin-bottom: 25px;
        }

        input {
            padding: 10px;
            border: 1px solid #ddd;
            border-radius: 6px;
            font-size: 14px;
        }

        input:focus {
            outline: none;
            border-color: #4a90e2;
        }

        button {
            padding: 12px;
            background: #4a90e2;
            color: #fff;
            border: none;
            border-radius: 6px;
            cursor: pointer;
            font-weight: bold;
        }

        button:hover {
            background: #357bd8;
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        th, td {
            padding: 12px;
            text-align: left;
        }

        th {
            background: #f0f3f8;
        }

        tr {
            border-bottom: 1px solid #eee;
        }

        tr:hover {
            background: #fafafa;
        }

        .badge {
            padding: 4px 8px;
            border-radius: 4px;
            background: #eef3ff;
            color: #4a90e2;
            font-size: 12px;
        }

        .empty {
            color: #aaa;
            font-style: italic;
        }
    </style>
</head>

<body>

<div class="container">

    <h2>🌍 City Discover Mapping</h2>

    ${success ? `<div class="success">✅ Saved successfully</div>` : ""}

    <form method="POST" action="/add-city">
        <input name="city_slug" placeholder="City Slug (e.g. tokyo)" required />
        <input name="event_id" placeholder="Event Discover ID (discplace-...)" />
        <input name="calendar_id" placeholder="Calendar Discover ID (discplace-...)" />
        <button type="submit">Save Mapping</button>
    </form>

    <h3>Saved Cities</h3>

    <table>
        <tr>
            <th>City</th>
            <th>Event Discover ID</th>
            <th>Calendar Discover ID</th>
        </tr>

        ${tableRows || `
            <tr>
                <td colspan="3" class="empty">No data yet</td>
            </tr>
        `}
    </table>

</div>

</body>
</html>
`);

res.redirect("/?success=1");

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
