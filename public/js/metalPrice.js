document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const loadingSpinner = document.getElementById('loadingSpinner');
    const headerVideo = document.querySelector('.header-video');

    // Show loading spinner
    function showLoading() {
        loadingSpinner.classList.add('active');
    }

    // Hide loading spinner
    function hideLoading() {
        loadingSpinner.classList.remove('active');
    }

    async function loadPrices() {
        showLoading(); // Show spinner
        try {
            const response = await fetch('/api/prices');
            if (!response.ok) throw new Error('Failed to load prices');
            const prices = await response.json();
            
            for (const [key, value] of Object.entries(prices)) {
                document.getElementById(key).value = value;
            }
        } catch (err) {
            showMessage('Error loading prices', 'error');
        } finally {
            hideLoading(); // Hide spinner
        }
    }

    async function updatePrices() {
        const prices = {
            "10KT": parseFloat(document.getElementById('10KT').value),
            "14KT": parseFloat(document.getElementById('14KT').value),
            "18KT": parseFloat(document.getElementById('18KT').value),
            "22KT": parseFloat(document.getElementById('22KT').value),
            "24KT": parseFloat(document.getElementById('24KT').value),
            "Silver": parseFloat(document.getElementById('Silver').value),
            "Platinum": parseFloat(document.getElementById('Platinum').value)
        };

        // Validate inputs
        for (const [key, value] of Object.entries(prices)) {
            if (isNaN(value) || value < 0) {
                showMessage(`Please enter a valid price for ${key}`, 'error');
                return;
            }
        }

        showLoading(); // Show spinner
        try {
            const response = await fetch('/api/prices', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(prices)
            });

            if (!response.ok) throw new Error('Failed to update prices');
            const result = await response.json();
            showNotification('Prices updated successfully!'); // Show bottom-right notification
        } catch (err) {
            showMessage('Error updating prices', 'error');
        } finally {
            hideLoading(); // Hide spinner
        }
    }

    function showMessage(text, type) {
        const messageEl = document.getElementById('message');
        messageEl.textContent = text;
        messageEl.style.color = type === 'success' ? '#28a745' : '#dc3545';
    }

    function showNotification(text) {
        // Create notification element
        const notification = document.createElement('div');
        notification.className = 'notification';
        notification.textContent = text;

        // Append to body
        document.body.appendChild(notification);

        // Trigger fade-in
        setTimeout(() => {
            notification.classList.add('show');
        }, 100); // Small delay to allow CSS transition

        // Remove after 3 seconds
        setTimeout(() => {
            notification.classList.remove('show');
            setTimeout(() => {
                notification.remove();
            }, 300); // Match transition duration
        }, 3000);
    }

    // Log video load status
    if (headerVideo) {
        headerVideo.addEventListener('loadeddata', () => {
            // console.log('Header video loaded successfully');
        });
        headerVideo.addEventListener('error', (e) => {
            console.error('Error loading header video:', e);
            showMessage('Failed to load header video', 'error');
        });
    }

    // Full-Screen Video Functionality
    const videoOverlay = document.createElement('div');
    videoOverlay.className = 'video-overlay';
    videoOverlay.innerHTML = `
        <video class="fullscreen-video" autoplay loop muted playsinline>
            <source src="/assest/showDiamond.mp4" type="video/mp4">
            Your browser does not support the video tag.
        </video>
        <button class="close-button">X</button>
    `;
    document.body.appendChild(videoOverlay);

    const fullscreenVideo = videoOverlay.querySelector('.fullscreen-video');
    const closeButton = videoOverlay.querySelector('.close-button');

    // Open full-screen video on header video click
    headerVideo.addEventListener('click', () => {
        videoOverlay.classList.add('active');
        fullscreenVideo.play().catch((e) => {
            console.error('Error playing fullscreen video:', e);
            showMessage('Failed to play fullscreen video', 'error');
        });
    });

    // Close full-screen video on close button click
    closeButton.addEventListener('click', (e) => {
        e.stopPropagation(); // Prevent triggering overlay click
        videoOverlay.classList.remove('active');
        fullscreenVideo.pause(); // Pause video when closing
        fullscreenVideo.currentTime = 0; // Reset video to start
    });

    // Close full-screen video on overlay click (outside video)
    videoOverlay.addEventListener('click', (e) => {
        if (e.target === videoOverlay) {
            videoOverlay.classList.remove('active');
            fullscreenVideo.pause(); // Pause video when closing
            fullscreenVideo.currentTime = 0; // Reset video to start
        }
    });

    // Close full-screen video on Esc key press
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape' && videoOverlay.classList.contains('active')) {
            videoOverlay.classList.remove('active');
            fullscreenVideo.pause();
            fullscreenVideo.currentTime = 0;
        }
    });

    // Ensure fullscreen video loads correctly
    fullscreenVideo.addEventListener('loadeddata', () => {
        // ('Fullscreen video loaded successfully');
    });
    fullscreenVideo.addEventListener('error', (e) => {
        console.error('Error loading fullscreen video:', e);
        showMessage('Failed to load fullscreen video', 'error');
    });

    // Expose updatePrices to global scope for button onclick
    window.updatePrices = updatePrices;

    // Load prices when page loads
    loadPrices();
});