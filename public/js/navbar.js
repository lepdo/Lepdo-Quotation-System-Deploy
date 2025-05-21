document.addEventListener('DOMContentLoaded', () => {
    const navLinks = document.querySelectorAll('.nav-links');
    const currentPath = window.location.pathname; // e.g., "/index.html" or "/search.html"
    // console.log('Current Path:', currentPath); // Debug: Log current path

    navLinks.forEach(link => {
        const linkPath = new URL(link.href).pathname; // Get pathname from link.href
        // console.log('Link Path:', linkPath); // Debug: Log each link’s path

        if (linkPath === currentPath || link.href === window.location.href) {
            link.classList.add('active');
            // console.log('Active link set:', link.href); // Debug: Confirm active link
        }
    });
});