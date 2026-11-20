function parsePrometheus(text) {
    const metrics = {};
    const lines = text.split('\n');
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;

        const match = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)\s*(?:\{([^}]*)\})?\s+([\d.eE+-]+|NaN|Inf|\+Inf|-Inf)$/);
        if (match) {
            const name = match[1];
            const labels = match[2] || '';
            const value = parseFloat(match[3]);
            const key = labels ? `${name}{${labels}}` : name;
            metrics[key] = isNaN(value) ? 0 : value;
        }
    }
    return metrics;
}

function findMetric(metrics, partialName) {
    for (const key of Object.keys(metrics)) {
        if (key.includes(partialName)) return metrics[key];
    }
    return null;
}

module.exports = async (req, res) => {
    const PROJECT_REF = process.env.SUPABASE_PROJECT_REF;
    const TOKEN = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!PROJECT_REF || !TOKEN || TOKEN === 'YOUR_SERVICE_ROLE_KEY_HERE') {
        return res.status(500).json({
            error: 'Missing SUPABASE_PROJECT_REF or SUPABASE_SERVICE_ROLE_KEY in environment variables',
            help: 'Add SUPABASE_PROJECT_REF and SUPABASE_SERVICE_ROLE_KEY to your Vercel Project Environment Variables'
        });
    }

    const url = `https://${PROJECT_REF}.supabase.co/customer/v1/privileged/metrics`;

    try {
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

        const cpuUsage = findMetric(metrics, 'cpu_usage') ?? findMetric(metrics, 'node_cpu') ?? 0;
        const memTotal = findMetric(metrics, 'node_memory_MemTotal') ?? 0;
        const memAvail = findMetric(metrics, 'node_memory_MemAvailable') ?? findMetric(metrics, 'node_memory_MemFree') ?? 0;
        const memUsedPercent = memTotal > 0 ? ((memTotal - memAvail) / memTotal * 100).toFixed(1) : '0.0';
        const diskRead = findMetric(metrics, 'node_disk_read_bytes_total') ?? 0;
        const diskWrite = findMetric(metrics, 'node_disk_written_bytes_total') ?? 0;
        const netRx = findMetric(metrics, 'node_network_receive_bytes_total') ?? 0;
        const netTx = findMetric(metrics, 'node_network_transmit_bytes_total') ?? 0;
        const bootTime = findMetric(metrics, 'node_boot_time_seconds') ?? 0;
        const uptimeSeconds = bootTime > 0 ? Math.floor(Date.now() / 1000 - bootTime) : 0;
        const httpRequests = findMetric(metrics, 'http_requests_total') ?? 0;
        const httpLatency = findMetric(metrics, 'http_request_duration_seconds') ?? 0;
        const dbConnections = findMetric(metrics, 'pg_stat_activity_count') ?? findMetric(metrics, 'pg_connections') ?? 0;

        res.status(200).json({
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
            api_response_time: Math.round(httpLatency * 1000),
            db_connections: dbConnections,
            raw_metric_count: Object.keys(metrics).length,
            fetched_at: new Date().toISOString(),
        });
    } catch (error) {
        console.error('Metrics fetch error:', error.message);
        res.status(500).json({ error: error.message });
    }
};
