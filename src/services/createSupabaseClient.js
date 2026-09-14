function createSupabaseClient({ url, serviceRoleKey, fetchImpl = globalThis.fetch } = {}) {
    const baseUrl = String(url || "").replace(/\/$/, "");
    const enabled = Boolean(baseUrl && serviceRoleKey);

    async function request(path, options = {}) {
        if (!enabled) return null;
        const response = await fetchImpl(`${baseUrl}/rest/v1/${path}`, {
            ...options,
            headers: {
                apikey: serviceRoleKey,
                Authorization: `Bearer ${serviceRoleKey}`,
                "Content-Type": "application/json",
                ...options.headers
            }
        });
        if (!response.ok) {
            const body = await response.text();
            throw new Error(`Supabase request failed (${response.status}): ${body}`);
        }
        if (response.status === 204) return null;
        const text = await response.text();
        return text ? JSON.parse(text) : null;
    }

    async function getCache(cacheKey, cacheType) {
        const query = new URLSearchParams({
            select: "response_data,expires_at",
            cache_key: `eq.${cacheKey}`,
            cache_type: `eq.${cacheType}`,
            limit: "1"
        });
        const rows = await request(`api_cache?${query}`);
        const entry = rows?.[0];
        if (!entry || new Date(entry.expires_at).getTime() <= Date.now()) return null;
        return entry.response_data;
    }

    async function setCache(cacheKey, cacheType, responseData, expiresAt) {
        return request("api_cache?on_conflict=cache_key", {
            method: "POST",
            headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
            body: JSON.stringify({
                cache_key: cacheKey,
                cache_type: cacheType,
                response_data: responseData,
                expires_at: expiresAt,
                updated_at: new Date().toISOString()
            })
        });
    }

    async function submitIssue(issue) {
        return request("issue_reports", {
            method: "POST",
            headers: { Prefer: "return=minimal" },
            body: JSON.stringify(issue)
        });
    }

    return { enabled, getCache, setCache, submitIssue };
}

module.exports = createSupabaseClient;
