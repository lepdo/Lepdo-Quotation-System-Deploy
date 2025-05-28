
const SESSION_TIMEOUT = 2 * 60 * 60 * 1000; // 2 hours in milliseconds

document.addEventListener('DOMContentLoaded', function() {
    // Skip check if on password page
    if (window.location.pathname.endsWith('password.html')) return;
    
    // Check if authenticated and session is still valid
    const authTime = sessionStorage.getItem('authTime');
    const currentTime = Date.now();
    
    if (authTime && currentTime - parseInt(authTime) > SESSION_TIMEOUT) {
        sessionStorage.removeItem('authenticated');
        sessionStorage.removeItem('authTime');
    }
    
    if (sessionStorage.getItem('authenticated') !== 'true') {
        // Redirect to password page with current page as redirect parameter
        const currentUrl = encodeURIComponent(window.location.pathname + window.location.search);
        window.location.href = `/password.html?redirect=${currentUrl}`;
    }
});
