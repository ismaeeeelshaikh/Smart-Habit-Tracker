let accessToken: string | null = null;

export const setAccessToken = (token: string | null) => {
    accessToken = token;
};

export const getAccessToken = () => accessToken;

export const apiFetch = async (endpoint: string, options: RequestInit = {}) => {
    const headers = new Headers(options.headers || {});
    
    if (accessToken) {
        headers.set('Authorization', `Bearer ${accessToken}`);
    }
    
    const response = await fetch(endpoint, {
        ...options,
        headers
    });
    
    return response;
};
