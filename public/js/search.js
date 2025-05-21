const elements = {
    cardGrid: document.getElementById('card-grid'),
    searchInput: document.getElementById('search-input'),
    searchBtn: document.getElementById('search-btn'),
    suggestions: document.getElementById('suggestions'),
    categoryFilter: document.getElementById('category-filter'),
    skuFilter: document.getElementById('sku-filter'),
    dateFrom: document.getElementById('date-from'),
    dateTo: document.getElementById('date-to'),
    resetFiltersBtn: document.getElementById('reset-filters'),
    detailModal: document.getElementById('detail-modal'),
    modalImg: document.getElementById('modal-img'),
    modalTitle: document.getElementById('modal-title'),
    modalSku: document.getElementById('modal-sku'),
    modalCategory: document.getElementById('modal-category'),
    modalDate: document.getElementById('modal-date'),
    metalTableBody: document.querySelector('#metal-table tbody'),
    diamondTableBody: document.querySelector('#diamond-table tbody'),
    modalMetalAmount: document.getElementById('modal-metal-amount'),
    modalMakingCharges: document.getElementById('modal-making-charges'),
    modalPurities: document.getElementById('modal-purities'),
    modalDiamondAmount: document.getElementById('modal-diamond-amount'),
    modalFinalQuotation: document.getElementById('modal-final-quotation'),
    summaryTableBody: document.querySelector('#summary-table tbody'),
    modalCloseBtn: document.getElementById('modal-close-btn'),
    modalDeleteBtn: document.getElementById('modal-delete-btn'),
    modalCloseX: document.getElementById('modal-close-x'),
    toast: document.getElementById('toast'),
    confirmationDialog: document.getElementById('confirmation-dialog'),
    confirmDelete: document.getElementById('confirm-delete'),
    cancelDelete: document.getElementById('cancel-delete'),
    themeToggle: document.getElementById('theme-toggle'),
    backToTop: document.getElementById('backToTop'),
    scrollToBottom: document.getElementById('scrollToBottom'),
};

let quotations = [];
let currentQuotation = null;

async function init() {
    await fetchQuotations();
    populateCategoryFilter();
    setupEventListeners();
    loadTheme();
}

async function fetchQuotations() {
    try {
        // Show loading spinner
        document.getElementById('loadingSpinner').style.display = 'flex';
        
        const response = await fetch('/api/metadata');
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        quotations = await response.json();
        quotations.sort((a, b) => {
            const dateA = new Date(a.quotationDate);
            const dateB = new Date(b.quotationDate);
            if (isNaN(dateA)) return 1;
            if (isNaN(dateB)) return -1;
            return dateB - dateA;
        });
        renderCards(quotations);
    } catch (error) {
        console.error('Error fetching quotations:', error);
        showToast('Failed to load quotations. Please try again.');
        renderCards([]);
    } finally {
        // Hide loading spinner
        document.getElementById('loadingSpinner').style.display = 'none';
    }
}

function hasValidImage(image) {
    return typeof image === 'string' && image.trim() !== '' && image !== 'data:image/svg+xml;base64,' && !image.includes('undefined');
}

function createCard(quotation) {
    const card = document.createElement('div');
    card.className = `card ${!quotation.identification.images.length || !hasValidImage(quotation.identification.images[0]) ? 'card--no-image' : ''}`;
    card.dataset.quotationId = quotation.quotationId;

    if (quotation.identification.images.length > 0 && hasValidImage(quotation.identification.images[0])) {
        const img = document.createElement('img');
        img.className = 'card-img';
        img.src = quotation.identification.images[0];
        img.alt = quotation.identification.category;
        img.onerror = () => {
            img.classList.add('hidden');
            card.classList.add('card--no-image');
        };
        card.appendChild(img);
    }

    const closeContainer = document.createElement('div');
    closeContainer.className = 'card-close-container';
    closeContainer.innerHTML = '';

    const leftBracket = document.createElement('span');
    leftBracket.className = 'bracket';
    leftBracket.textContent = '';

    const closeBtn = document.createElement('button');
    closeBtn.className = 'card-close-x';
    closeBtn.innerHTML = 'X';
    closeBtn.setAttribute('aria-label', 'Delete quotation');
    closeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        e.preventDefault();
        showDeleteConfirmation(quotation.quotationId);
    });

    const rightBracket = document.createElement('span');
    rightBracket.className = 'bracket';
    rightBracket.textContent = '';

    closeContainer.appendChild(leftBracket);
    closeContainer.appendChild(closeBtn);
    closeContainer.appendChild(rightBracket);
    card.appendChild(closeContainer);

    const cardBody = document.createElement('div');
    cardBody.className = 'card-body';

    const title = document.createElement('h3');
    title.className = 'card-title';
    title.textContent = quotation.identification.category;

    const sku = document.createElement('p');
    sku.className = 'card-text';
    sku.innerHTML = `<strong>SKU:</strong> ${quotation.identification.idSku}`;

    const date = document.createElement('p');
    date.className = 'card-text card-date';
    date.innerHTML = `<strong>Date:</strong> ${formatDate(quotation.quotationDate)}`;

    const downloadBtn = document.createElement('button');
    downloadBtn.className = 'download-btn';
    downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download Excel';
    downloadBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        exportToExcel(quotation);
    });

    cardBody.appendChild(title);
    cardBody.appendChild(sku);
    cardBody.appendChild(date);
    cardBody.appendChild(downloadBtn);
    card.appendChild(cardBody);

    card.addEventListener('click', (e) => {
        if (e.target !== closeBtn && !e.target.classList.contains('bracket') && e.target !== downloadBtn) {
            openModal(quotation);
        }
    });

    return card;
}

function exportToExcel(quotation) {
    // Show loading spinner and disable download button
    document.getElementById('loadingSpinner').style.display = 'flex';
    const downloadButtons = document.querySelectorAll('.download-btn');
    downloadButtons.forEach(btn => btn.disabled = true);

    // Ensure spinner is visible for at least 500ms for UX
    setTimeout(() => {
        try {
            const wb = XLSX.utils.book_new();

            // Metal Items Sheet
            const metalData = quotation.metalItems.map(item => ({
                Purity: item.purity,
                Grams: item.grams,
                'Rate/Gram': `₹${item.ratePerGram}`,
                'Total Metal': `₹${item.totalMetal}`,
                'Making Charges': `₹${item.makingCharges}`
            }));
            const metalSheet = XLSX.utils.json_to_sheet(metalData);
            XLSX.utils.book_append_sheet(wb, metalSheet, 'Metal Items');

            // Diamond Items Sheet
            const diamondData = quotation.diamondItems.length > 0
                ? quotation.diamondItems.map(item => ({
                    Shape: item.shape,
                    Dimensions: item.mm,
                    Pieces: item.pcs,
                    'Weight/Piece': `${item.weightPerPiece}ct`,
                    'Total Weight': `${item.totalWeightCt}ct`,
                    'Price/Ct': `₹${item.pricePerCt}`,
                    Total: `₹${item.total}`
                }))
                : [{ Message: 'No diamond items' }];
            const diamondSheet = XLSX.utils.json_to_sheet(diamondData);
            XLSX.utils.book_append_sheet(wb, diamondSheet, 'Diamond Items');

            // Summary Sheet
            const summaryData = quotation.summary.metalSummary.map(item => ({
                Description: item.purity,
                'Metal Amount': `₹${item.totalMetal}`,
                'Making Charges': `₹${item.makingCharges}`,
                'Diamond Amount': `₹${item.totalDiamondAmount}`,
                Total: `₹${item.total}`
            }));
            const summarySheet = XLSX.utils.json_to_sheet(summaryData);
            XLSX.utils.book_append_sheet(wb, summarySheet, 'Summary');

            // Identification Sheet
            const identificationData = [{
                'SKU ID': quotation.identification.idSku,
                Category: quotation.identification.category,
                'Quotation Date': formatDate(quotation.quotationDate)
            }];
            const idSheet = XLSX.utils.json_to_sheet(identificationData);
            XLSX.utils.book_append_sheet(wb, idSheet, 'Identification');

            // Download the Excel file
            XLSX.writeFile(wb, `Quotation_${quotation.quotationId}.xlsx`);

            // Hide spinner and re-enable buttons
            document.getElementById('loadingSpinner').style.display = 'none';
            downloadButtons.forEach(btn => btn.disabled = false);
            showToast('Excel file downloaded successfully');
        } catch (error) {
            console.error('Error exporting Excel:', error);
            document.getElementById('loadingSpinner').style.display = 'none';
            downloadButtons.forEach(btn => btn.disabled = false);
            showToast('Failed to download Excel file. Please try again.');
        }
    }, 500); // Minimum 500ms delay for spinner visibility
}

function renderCards(data) {
    elements.cardGrid.innerHTML = data.length === 0 
        ? '<div class="no-results-container">No quotations found 🤷‍♂️</div>'
        : '';
    data.forEach((quotation, index) => {
        const card = createCard(quotation);
        card.style.animationDelay = `${index * 0.1}s`;
        elements.cardGrid.appendChild(card);
    });
}

function openModal(quotation) {
    currentQuotation = quotation;

    elements.detailModal.style.display = 'none';

    elements.modalImg.className = quotation.identification.images.length > 0 && hasValidImage(quotation.identification.images[0]) ? 'modal-img' : 'modal-img hidden';
    if (quotation.identification.images.length > 0 && hasValidImage(quotation.identification.images[0])) {
        elements.modalImg.src = quotation.identification.images[0];
        elements.modalImg.onerror = () => elements.modalImg.classList.add('hidden');
        elements.modalImg.style.cursor = 'pointer';
        elements.modalImg.onclick = () => openFullScreenImage(quotation.identification.images[0]);
    } else {
        elements.modalImg.onclick = null;
    }

    const modalBody = document.querySelector('.modal-body');
    let imageGallery = modalBody.querySelector('.image-gallery');
    if (!imageGallery) {
        imageGallery = document.createElement('div');
        imageGallery.className = 'image-gallery';
        modalBody.insertBefore(imageGallery, modalBody.firstChild);
    }
    imageGallery.innerHTML = quotation.identification.images.length > 0 
        ? quotation.identification.images.map((img, index) => 
            `<img src="${img}" alt="Product Image ${index + 1}" class="gallery-img ${index === 0 ? 'active' : ''}" onclick="changeModalImage('${img}')">`
        ).join('')
        : '<p>No images available</p>';

    elements.modalTitle.textContent = quotation.identification.category;
    elements.modalSku.textContent = quotation.identification.idSku;
    elements.modalCategory.textContent = quotation.identification.category;
    elements.modalDate.textContent = formatDate(quotation.quotationDate);

    elements.metalTableBody.innerHTML = quotation.metalItems.map(item => `
        <tr>
            <td>${item.purity}</td>
            <td>${item.grams}g</td>
            <td>₹${item.ratePerGram}</td>
            <td>₹${item.totalMetal}</td>
            <td>₹${item.makingCharges}</td>
        </tr>
    `).join('');

    elements.diamondTableBody.innerHTML = quotation.diamondItems.length > 0 
        ? quotation.diamondItems.map(item => `
            <tr>
                <td>${item.shape}</td>
                <td>${item.mm}</td>
                <td>${item.pcs}</td>
                <td>${item.weightPerPiece}ct</td>
                <td>${item.totalWeightCt}ct</td>
                <td>₹${item.pricePerCt}</td>
                <td>₹${item.total}</td>
            </tr>
        `).join('')
        : '<tr><td colspan="7" style="text-align: center;">No diamond items</td></tr>';

    const totalMetalAmount = quotation.metalItems.reduce((sum, item) => sum + parseFloat(item.totalMetal || 0), 0).toFixed(2);
    const totalMakingCharges = quotation.metalItems.reduce((sum, item) => sum + parseFloat(item.makingCharges || 0), 0).toFixed(2);
    const metalPurities = quotation.metalItems.map(item => item.purity).join(', ');

    elements.modalMetalAmount.textContent = `₹${totalMetalAmount}`;
    elements.modalMakingCharges.textContent = `₹${totalMakingCharges}`;
    elements.modalPurities.textContent = metalPurities;
    elements.modalDiamondAmount.textContent = `₹${quotation.summary.totalDiamondAmount}`;

    elements.summaryTableBody.innerHTML = quotation.summary.metalSummary.map(item => `
        <tr>
            <td>${item.purity}</td>
            <td>₹${item.totalMetal}</td>
            <td>₹${item.makingCharges}</td>
            <td>₹${item.totalDiamondAmount}</td>
            <td>₹${item.total}</td>
        </tr>
    `).join('');

    const modalFooter = document.querySelector('.modal-footer');
    let downloadBtn = modalFooter.querySelector('.download-btn');
    if (!downloadBtn) {
        downloadBtn = document.createElement('button');
        downloadBtn.className = 'download-btn';
        downloadBtn.innerHTML = '<i class="fas fa-download"></i> Download Excel';
        modalFooter.insertBefore(downloadBtn, elements.modalDeleteBtn);
    }
    downloadBtn.onclick = (e) => {
        e.stopPropagation();
        exportToExcel(quotation);
    };

    elements.modalDeleteBtn.onclick = (e) => {
        e.stopPropagation();
        showDeleteConfirmation(quotation.quotationId);
    };

    elements.detailModal.style.display = 'block';
    document.body.style.overflow = 'hidden';
    elements.detailModal.scrollTop = 0;
    elements.modalCloseBtn.focus();
}

function changeModalImage(src) {
    elements.modalImg.src = src;
    elements.modalImg.classList.remove('hidden');
    const galleryImages = document.querySelectorAll('.gallery-img');
    galleryImages.forEach(img => img.classList.remove('active'));
    const clickedImage = Array.from(galleryImages).find(img => img.src === src);
    if (clickedImage) clickedImage.classList.add('active');
}

function openFullScreenImage(src) {
    const fullScreenDiv = document.createElement('div');
    fullScreenDiv.className = 'fullscreen-image';
    fullScreenDiv.innerHTML = `
        <img src="${src}" alt="Full Screen Image">
        <button class="fullscreen-close">X</button>
    `;
    document.body.appendChild(fullScreenDiv);
    document.body.style.overflow = 'hidden';

    fullScreenDiv.querySelector('.fullscreen-close').addEventListener('click', () => {
        fullScreenDiv.remove();
        document.body.style.overflow = 'auto';
    });

    fullScreenDiv.addEventListener('click', (e) => {
        if (e.target === fullScreenDiv) {
            fullScreenDiv.remove();
            document.body.style.overflow = 'auto';
        }
    });
}

function closeModal() {
    elements.detailModal.style.display = 'none';
    document.body.style.overflow = 'auto';
    currentQuotation = null;
}

function showDeleteConfirmation(quotationId) {
    if (!quotationId) {
        console.warn('showDeleteConfirmation called without a valid quotationId');
        return;
    }
    elements.confirmationDialog.style.display = 'block';
    
    elements.confirmDelete.onclick = null;
    elements.cancelDelete.onclick = null;
    
    elements.confirmDelete.onclick = async () => {
        await deleteQuotation(quotationId);
        elements.confirmationDialog.style.display = 'none';
    };
    
    elements.cancelDelete.onclick = () => {
        elements.confirmationDialog.style.display = 'none';
    };
}

async function deleteQuotation(quotationId) {
    try {
        const response = await fetch(`/api/metadata/${quotationId}`, {
            method: 'DELETE'
        });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();
        quotations = quotations.filter(q => q.quotationId !== quotationId);
        quotations.sort((a, b) => {
            const dateA = new Date(a.quotationDate);
            const dateB = new Date(b.quotationDate);
            if (isNaN(dateA)) return 1;
            if (isNaN(dateB)) return -1;
            return dateB - dateA;
        });
        renderCards(quotations);
        showToast(result.message || 'Quotation deleted successfully');
        if (currentQuotation?.quotationId === quotationId) closeModal();
        populateCategoryFilter();
    } catch (error) {
        console.error('Error deleting quotation:', error);
        showToast('Failed to delete quotation. Please try again.');
    }
}

function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add('show');
    setTimeout(() => elements.toast.classList.remove('show'), 3000);
}

function populateCategoryFilter() {
    const categories = [...new Set(quotations.map(q => q.identification.category))];
    elements.categoryFilter.innerHTML = '<option value="">All Categories</option>' + 
        categories.map(category => `<option value="${category}">${category}</option>`).join('');
}

function formatDate(dateInput) {
    if (!dateInput) {
        return 'Invalid Date';
    }

    let date;

    // Check if input is a Firestore Timestamp object
    if (typeof dateInput === 'object' && (dateInput._seconds || dateInput.seconds)) {
        const seconds = dateInput._seconds || dateInput.seconds;
        const nanoseconds = dateInput._nanoseconds || dateInput.nanoseconds || 0;
        date = new Date(seconds * 1000 + nanoseconds / 1000000); // Convert to milliseconds
    } else if (typeof dateInput === 'string') {
        // Handle string input as before
        const normalizedString = dateInput.replace(/[\u202F\u00A0]/g, ' ').trim();
        const [datePart, timePartWithTz] = normalizedString.split(' at ');
        if (!datePart || !timePartWithTz) {
            return 'Invalid Date';
        }
        const timeParts = timePartWithTz.split(' ');
        if (timeParts.length < 2) {
            return 'Invalid Date';
        }
        const time = timeParts[0];
        const period = timeParts[1];
        try {
            date = new Date(`${datePart} ${time} ${period}`);
        } catch (e) {
            return 'Invalid Date';
        }
    } else {
        return 'Invalid Date';
    }

    if (isNaN(date)) {
        return 'Invalid Date';
    }

    // Format the date for display
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function filterQuotations() {
    const searchTerm = elements.searchInput.value.toLowerCase();
    const category = elements.categoryFilter.value;
    const sku = elements.skuFilter.value;
    const fromDate = elements.dateFrom.value ? new Date(elements.dateFrom.value) : null;
    const toDate = elements.dateTo.value ? new Date(elements.dateTo.value) : null;

    const filtered = quotations.filter(q => {
        const matchesSearch = !searchTerm || [
            q.identification.idSku,
            q.identification.category,
            q.quotationId,
            q.metalItems.map(item => item.purity).join(', ')
        ].some(field => field.toLowerCase().includes(searchTerm));

        const matchesCategory = !category || q.identification.category === category;
        const matchesSku = !sku || q.identification.idSku === sku;

        const quoteDate = new Date(q.quotationDate);
        const quoteDateOnly = new Date(quoteDate.getFullYear(), quoteDate.getMonth(), quoteDate.getDate());
        const fromDateOnly = fromDate ? new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate()) : null;
        const toDateOnly = toDate ? new Date(toDate.getFullYear(), toDate.getMonth(), toDate.getDate()) : null;

        const matchesDate = (!fromDateOnly || quoteDateOnly >= fromDateOnly) && 
                           (!toDateOnly || quoteDateOnly <= toDateOnly);

        return matchesSearch && matchesCategory && matchesSku && matchesDate;
    });

    filtered.sort((a, b) => {
        const dateA = new Date(a.quotationDate);
        const dateB = new Date(b.quotationDate);
        if (isNaN(dateA)) return 1;
        if (isNaN(dateB)) return -1;
        return dateB - dateA;
    });
    renderCards(filtered);
}

function showSuggestions() {
    const term = elements.searchInput.value.toLowerCase();
    if (term.length < 2) {
        elements.suggestions.style.display = 'none';
        return;
    }

    const matches = quotations.reduce((acc, q) => {
        if (q.identification.idSku.toLowerCase().includes(term)) acc.push(`SKU: ${q.identification.idSku}`);
        if (q.identification.category.toLowerCase().includes(term)) acc.push(`Category: ${q.identification.category}`);
        if (q.metalItems.some(item => item.purity.toLowerCase().includes(term))) acc.push(`Metal: ${q.metalItems.map(item => item.purity).join(', ')}`);
        if (q.quotationId.toLowerCase().includes(term)) acc.push(`Quotation ID: ${q.quotationId}`);
        return acc;
    }, []);

    const uniqueMatches = [...new Set(matches)];
    elements.suggestions.innerHTML = uniqueMatches.length > 0 
        ? uniqueMatches.slice(0, 5).map(match => `
            <div class="suggestion-item" data-value="${match.split(': ')[1]}">${match}</div>
        `).join('')
        : '<div class="no-results">No matches found 🤷‍♂️</div>';

    elements.suggestions.style.display = 'block';
}

function resetFilters() {
    elements.searchInput.value = '';
    elements.categoryFilter.value = '';
    elements.skuFilter.value = '';
    elements.dateFrom.value = '';
    elements.dateTo.value = '';
    elements.suggestions.style.display = 'none';
    renderCards(quotations);
    showToast('Filters reset successfully!');
}

function toggleTheme() {
    const isDark = document.documentElement.dataset.theme === 'dark';
    document.documentElement.dataset.theme = isDark ? 'light' : 'dark';
    elements.themeToggle.textContent = isDark ? '🌙' : '☀️';
    localStorage.setItem('theme', isDark ? 'light' : 'dark');
}

function loadTheme() {
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    document.documentElement.dataset.theme = savedTheme;
    elements.themeToggle.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
}

function setupEventListeners() {
    elements.searchInput.addEventListener('input', () => {
        showSuggestions();
        filterQuotations();
    });
    elements.searchInput.addEventListener('focus', showSuggestions);
    document.addEventListener('click', e => {
        if (e.target !== elements.searchInput && !elements.suggestions.contains(e.target)) {
            elements.suggestions.style.display = 'none';
        }
    });
    elements.suggestions.addEventListener('click', e => {
        if (e.target.classList.contains('suggestion-item')) {
            elements.searchInput.value = e.target.dataset.value;
            elements.suggestions.style.display = 'none';
            filterQuotations();
        }
    });
    elements.searchBtn.addEventListener('click', filterQuotations);
    elements.categoryFilter.addEventListener('change', filterQuotations);
    elements.skuFilter.addEventListener('input', filterQuotations);
    elements.dateFrom.addEventListener('change', filterQuotations);
    elements.dateTo.addEventListener('change', filterQuotations);
    elements.resetFiltersBtn.addEventListener('click', resetFilters);
    elements.modalCloseBtn.addEventListener('click', closeModal);
    elements.modalCloseX.addEventListener('click', closeModal);
    elements.detailModal.addEventListener('click', e => {
        if (e.target === elements.detailModal) closeModal();
    });
    if (elements.themeToggle) {
        elements.themeToggle.addEventListener('click', toggleTheme);
    }

    elements.backToTop.addEventListener('click', () => {
        window.scrollTo({ top: 0, behavior: 'smooth' });
    });

    elements.scrollToBottom.addEventListener('click', () => {
        window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
    });

    window.addEventListener('resize', () => {
        elements.suggestions.style.display = 'none';
        if (elements.detailModal.style.display === 'block') {
            elements.detailModal.scrollTop = 0;
        }
        filterQuotations();
    });
}

document.addEventListener('DOMContentLoaded', init);