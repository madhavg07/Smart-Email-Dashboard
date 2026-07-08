import { useState, useEffect, useCallback } from 'react';

// This object lives OUTSIDE the React tree. It survives all page navigation!
const globalCache = {};

export function useApiCache(cacheKey, fetchFunction) {
    const [data, setData] = useState(globalCache[cacheKey] || null);
    const [isLoading, setIsLoading] = useState(!globalCache[cacheKey]);
    
    // NEW: Tracks manual button clicks
    const [isRefreshing, setIsRefreshing] = useState(false); 
    const [error, setError] = useState(null);

    const fetchData = useCallback(async (forceRefresh = false) => {
        // Skip the network request if we already have it (and aren't forcing a refresh)
        if (globalCache[cacheKey] && !forceRefresh) {
            setData(globalCache[cacheKey]);
            setIsLoading(false);
            return;
        }

        // Trigger the refreshing state so our button reacts!
        if (forceRefresh) setIsRefreshing(true);
        else if (!globalCache[cacheKey]) setIsLoading(true);

        setError(null);

        try {
            const result = await fetchFunction();
            globalCache[cacheKey] = result; // Save the fresh data to the cache
            setData(result);
        } catch (err) {
            setError(err.message || "Failed to fetch data");
        } finally {
            setIsLoading(false);
            setIsRefreshing(false); // Turn off the button spinner
        }
    }, [cacheKey, fetchFunction]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    // The function you will attach to your button
    const refresh = () => fetchData(true);

    return { data, isLoading, isRefreshing, error, refresh, setData };
}