require('dotenv').config();
const express = require('express');
const cors = require('cors');

const path = require('path');
const app = express();
app.use(cors());
app.use(express.json());

// ─── Serve Static Files ─────────────────────────────────────────────────────
// Serves the entire project so admin HTML pages work at http://localhost:3000/
app.use(express.static(path.join(__dirname)));


// ─── Prometheus Text Parser ─────────────────────────────────────────────────
// Parses Prometheus exposition format into { metricName: value } pairs.
// Handles HELP/TYPE comments and multi-line metrics.
function parsePrometheus(text) {
    const metrics = {};
    const lines = text.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        // Skip blank lines, HELP and TYPE comments
        if (!trimmed || trimmed.startsWith('#')) continue;

        // Standard format: metric_name{labels} value  OR  metric_name value
        const match = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\s*(?:\{([^}]*)\})?\s+([\d.eE+-]+|NaN|Inf|\+Inf|-Inf)$/);
        if (match) {
            const name = match[1];
            const labels = match[2] || '';
            const value = parseFloat(match[3]);
            // Use "name{labels}" as key when labels exist, else just name
            const key = labels ? `${name}{${labels}}` : name;
            metrics[key] = isNaN(value) ? 0 : value;
        }
    }
    return metrics;
}

// Helper: safely get a metric by partial name match
function findMetric(metrics, partialName) {
    for (const key of Object.keys(metrics)) {
        if (key.includes(partialName)) return metrics[key];
    }
    return null;
}

// ─── /api/metrics endpoint ──────────────────────────────────────────────────
app.get('/api/metrics', async (req, res) => {
    const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
    const TOKEN = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!PROJECT_REF || !TOKEN || TOKEN === 'YOUR_SERVICE_ROLE_KEY_HERE') {
        return res.status(500).json({
            error: 'Missing SUPABASE_PROJECT_REF or SUPABASE_SERVICE_ROLE_KEY in .env',
            help: 'Get your Service Role Key (JWT) from https://supabase.com/dashboard/project/_/settings/api'
        });
    }

    const url = `https://${PROJECT_REF}.supabase.co/customer/v1/privileged/metrics`;

    try {
        // Supabase metrics endpoint requires HTTP Basic Auth
        // Username is 'service_role', Password is the Service Role JWT
        const base64Credentials = Buffer.from(`service_role:${TOKEN}`).toString('base64');

        const response = await fetch(url, {
            headers: {
                'apikey': TOKEN,
                'Authorization': `Basic ${base64Credentials}`
            }
        });

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`Supabase API returned ${response.status}: ${errText.slice(0, 200)}`);
        }

        const textData = await response.text();
        const metrics = parsePrometheus(textData);

        // ─── Extract Key Metrics ──────────────────────────────────────
        // CPU / Server Load
        const cpuUsage = findMetric(metrics, 'cpu_usage') ?? findMetric(metrics, 'node_cpu') ?? 0;

        // Memory
        const memTotal = findMetric(metrics, 'node_memory_MemTotal') ?? 0;
        const memAvail = findMetric(metrics, 'node_memory_MemAvailable') ?? findMetric(metrics, 'node_memory_MemFree') ?? 0;
        const memUsedPercent = memTotal > 0 ? ((memTotal - memAvail) / memTotal * 100).toFixed(1) : '0.0';

        // Disk I/O (bytes read)
        const diskRead = findMetric(metrics, 'node_disk_read_bytes_total') ?? 0;
        const diskWrite = findMetric(metrics, 'node_disk_written_bytes_total') ?? 0;

        // Network
        const netRx = findMetric(metrics, 'node_network_receive_bytes_total') ?? 0;
        const netTx = findMetric(metrics, 'node_network_transmit_bytes_total') ?? 0;

        // Uptime (seconds since boot)
        const bootTime = findMetric(metrics, 'node_boot_time_seconds') ?? 0;
        const uptimeSeconds = bootTime > 0 ? Math.floor(Date.now() / 1000 - bootTime) : 0;

        // HTTP request metrics (if available via API gateway)
        const httpRequests = findMetric(metrics, 'http_requests_total') ?? 0;
        const httpLatency = findMetric(metrics, 'http_request_duration_seconds') ?? 0;

        // Database connections
        const dbConnections = findMetric(metrics, 'pg_stat_activity_count') ?? findMetric(metrics, 'pg_connections') ?? 0;

        res.json({
            server_load: parseFloat(cpuUsage).toFixed(1),
            memory_used_percent: memUsedPercent,
            memory_total_bytes: memTotal,
            memory_available_bytes: memAvail,
            disk_read_bytes: diskRead,
            disk_write_bytes: diskWrite,
            network_rx_bytes: netRx,
            network_tx_bytes: netTx,
            uptime_seconds: uptimeSeconds,
            http_requests_total: httpRequests,
            http_latency_seconds: httpLatency,
            api_response_time: Math.round(httpLatency * 1000), // convert to ms
            db_connections: dbConnections,
            raw_metric_count: Object.keys(metrics).length,
            fetched_at: new Date().toISOString(),
        });

    } catch (error) {
        console.error('Metrics fetch error:', error.message);
        res.status(500).json({ error: error.message });
    }
});

// ─── Health check endpoint ──────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ─── Start Server ───────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`✅ Metrics proxy server running at http://localhost:${PORT}`);
    console.log(`   → GET /api/metrics  (Supabase Prometheus proxy)`);
    console.log(`   → GET /api/health   (Server health check)`);
});