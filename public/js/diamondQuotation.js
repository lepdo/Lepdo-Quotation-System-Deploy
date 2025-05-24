document.addEventListener('DOMContentLoaded', function() {
    // DOM Elements
    const diamondsTableBody = document.getElementById('diamondsTableBody');
    const addDiamondBtn = document.getElementById('addDiamondBtn');
    const diamondModal = document.getElementById('diamondModal');
    const closeBtn = document.querySelector('.close-btn');
    const diamondForm = document.getElementById('diamondForm');
    const modalTitle = document.getElementById('modalTitle');
    const diamondIdInput = document.getElementById('diamondId');
    const shapeInput = document.getElementById('shape');
    const mmNumberInput = document.getElementById('mmNumber');
    const mmTextInput = document.getElementById('mmText');
    const priceInput = document.getElementById('price');
    const toast = document.getElementById('toast');
    const loadingSpinner = document.getElementById('loadingSpinner');
    const shapeFilter = document.getElementById('shapeFilter');
    const mmFilter = document.getElementById('mmFilter');
    const resetConfirmation = document.getElementById('resetConfirmation');
    const resetFiltersBtn = document.getElementById('resetFiltersBtn');
    const deleteModal = document.getElementById('deleteModal');
    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    const deleteCloseBtn = document.querySelector('.delete-close-btn');
    const backToTopBtn = document.getElementById('backToTop');
    const topToBackBtn = document.getElementById('topToBack');
    let diamondsData = [];
    let isEditMode = false;
    
    // Initialize the app
    init();
    
    function init() {
        fetchDiamonds();
        setupEventListeners();
        updateScrollButtonsVisibility();
    }
    
    function setupEventListeners() {
        // Modal controls
        addDiamondBtn.addEventListener('click', openAddModal);
        closeBtn.addEventListener('click', closeModal);
        diamondForm.addEventListener('submit', handleFormSubmit);
        
        // Delete modal controls
        deleteCloseBtn.addEventListener('click', closeDeleteModal);
        cancelDeleteBtn.addEventListener('click', closeDeleteModal);
        confirmDeleteBtn.addEventListener('click', handleDelete);
        
        // Shape change handler to toggle MM input type
        shapeInput.addEventListener('change', toggleMMInput);
        
        // Filter controls
        shapeFilter.addEventListener('change', function() {
            const selectedShape = this.value;
            updateMMFilter(diamondsData, selectedShape || null);
            filterDiamonds();
        });
        
        mmFilter.addEventListener('change', filterDiamonds);
        
        // Close modals when clicking outside
        window.addEventListener('click', function(event) {
            if (event.target === diamondModal) {
                closeModal();
            }
            if (event.target === deleteModal) {
                closeDeleteModal();
            }
        });
        
        resetFiltersBtn.addEventListener('click', resetFilters);
        
        // Scroll button controls
        backToTopBtn.addEventListener('click', () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
        
        topToBackBtn.addEventListener('click', () => {
            window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
        });

        // Scroll event to show/hide buttons
        window.addEventListener('scroll', updateScrollButtonsVisibility);
    }

    function updateScrollButtonsVisibility() {
        
            backToTopBtn.classList.add('visible');
            topToBackBtn.classList.add('visible');
            if (window.scrollY > 100) {
                document.body.classList.add('scrolled');
            } else {
                document.body.classList.remove('scrolled');
            }
    }
    
    function toggleMMInput() {
        const shape = shapeInput.value;
        if (shape === 'ROUND') {
            mmNumberInput.style.display = 'block';
            mmTextInput.style.display = 'none';
            mmTextInput.value = '';
        } else {
            mmNumberInput.style.display = 'none';
            mmTextInput.style.display = 'block';
            mmNumberInput.value = '';
        }
    }
    
    function resetFilters() {
        shapeFilter.value = '';
        mmFilter.value = '';
        updateMMFilter(diamondsData);
        renderDiamonds(diamondsData);
        showResetConfirmation();
    }
    
    function showResetConfirmation() {
        resetConfirmation.classList.add('show');
        setTimeout(() => {
            resetConfirmation.classList.remove('show');
        }, 3000);
    }
    
    async function fetchDiamonds() {
        showLoading();
        try {
            const response = await fetch('/api/diamonds');
            if (!response.ok) throw new Error('Failed to fetch diamonds');
            diamondsData = await response.json();
            renderDiamonds(diamondsData);
            updateFilters(diamondsData);
            updateShapeDropdown(diamondsData);
        } catch (error) {
            showToast('Error loading diamonds', 'error');
            console.error('Error:', error);
        } finally {
            hideLoading();
        }
    }
    
    function updateShapeDropdown(diamonds) {
        const shapes = [...new Set(diamonds.map(d => d.SHAPE))].sort();
        shapeInput.innerHTML = '<option value="">Select Shape</option>';
        shapes.forEach(shape => {
            const option = document.createElement('option');
            option.value = shape;
            option.textContent = shape;
            shapeInput.appendChild(option);
        });
    }
    
    function renderDiamonds(diamonds) {
        diamondsTableBody.innerHTML = '';
        
        if (diamonds.length === 0) {
            const row = document.createElement('tr');
            row.innerHTML = `<td colspan="6" class="no-data">No diamonds found</td>`;
            diamondsTableBody.appendChild(row);
            return;
        }
        
        diamonds.forEach(diamond => {
            const row = document.createElement('tr');
            row.innerHTML = `
                <td>${diamond.id}</td>
                <td>${diamond.SHAPE}</td>
                <td>${diamond.MM}</td>
                <td>${diamond['MM & SHAPE']}</td>
                <td>Rs.${diamond['PRICE/CT'].toLocaleString()}</td>
                <td class="action-buttons">
                    <button class="btn warning edit-btn" data-id="${diamond.id}">
                        <i class="fas fa-edit"></i> Edit
                    </button>
                    <button class="btn danger delete-btn" data-id="${diamond.id}">
                        <i class="fas fa-trash"></i> Delete
                    </button>
                </td>
            `;
            
            const editBtn = row.querySelector('.edit-btn');
            const deleteBtn = row.querySelector('.delete-btn');
            
            editBtn.addEventListener('click', () => openEditModal(diamond.id));
            deleteBtn.addEventListener('click', () => openDeleteModal(diamond.id));
            
            diamondsTableBody.appendChild(row);
        });
    }
    
    function updateFilters(diamonds) {
        const shapes = [...new Set(diamonds.map(d => d.SHAPE))];
        shapeFilter.innerHTML = '<option value="">All Shapes</option>';
        shapes.forEach(shape => {
            const option = document.createElement('option');
            option.value = shape;
            option.textContent = shape;
            shapeFilter.appendChild(option);
        });
        
        updateMMFilter(diamonds);
    }
    
    function updateMMFilter(diamonds, selectedShape = null) {
        let filteredDiamonds = diamonds;
        if (selectedShape) {
            filteredDiamonds = diamonds.filter(d => d.SHAPE === selectedShape);
        }
        const mms = [...new Set(filteredDiamonds.map(d => d.MM))].sort();
        mmFilter.innerHTML = '<option value="">All Sizes</option>';
        mms.forEach(mm => {
            const option = document.createElement('option');
            option.value = mm;
            option.textContent = mm;
            mmFilter.appendChild(option);
        });
    }
    
    function filterDiamonds() {
        const shapeValue = shapeFilter.value;
        const mmValue = mmFilter.value;
        
        let filtered = diamondsData;
        if (shapeValue) {
            filtered = filtered.filter(d => d.SHAPE === shapeValue);
        }
        if (mmValue) {
            filtered = filtered.filter(d => d.MM == mmValue);
        }
        renderDiamonds(filtered);
    }
    
    function openAddModal() {
        isEditMode = false;
        modalTitle.textContent = 'Add New Diamond';
        diamondForm.reset();
        diamondIdInput.value = '';
        toggleMMInput();
        diamondModal.style.display = 'block';
    }
    
    function openEditModal(id) {
        isEditMode = true;
        modalTitle.textContent = 'Edit Diamond';
        
        const diamond = diamondsData.find(d => d.id === id);
        if (!diamond) {
            showToast('Diamond not found', 'error');
            return;
        }
        
        diamondIdInput.value = diamond.id;
        shapeInput.value = diamond.SHAPE;
        toggleMMInput();
        if (diamond.SHAPE === 'ROUND') {
            mmNumberInput.value = parseFloat(diamond.MM);
            mmTextInput.value = '';
        } else {
            mmTextInput.value = diamond.MM;
            mmNumberInput.value = '';
        }
        priceInput.value = parseFloat(diamond['PRICE/CT']);
        
        diamondModal.style.display = 'block';
    }
    
    function openDeleteModal(id) {
        document.getElementById('deleteDiamondId').value = id;
        deleteModal.style.display = 'block';
    }
    
    function closeModal() {
        diamondModal.style.display = 'none';
    }
    
    function closeDeleteModal() {
        deleteModal.style.display = 'none';
        document.getElementById('deleteDiamondId').value = '';
    }
    
    async function handleFormSubmit(e) {
        e.preventDefault();
    
        const shape = shapeInput.value;
        const mm = shape === 'ROUND' ? parseFloat(mmNumberInput.value) : mmTextInput.value;
        const price = parseFloat(priceInput.value);
    
        const diamondData = {
            SHAPE: shape,
            MM: mm,
            'PRICE/CT': price
        };
    
        // Validate inputs
        if (!diamondData.SHAPE || !diamondData.MM || isNaN(diamondData['PRICE/CT'])) {
            showToast('Please fill all fields with valid values', 'error');
            return;
        }
    
        if (shape === 'ROUND' && isNaN(diamondData.MM)) {
            showToast('MM must be a number for ROUND shape', 'error');
            return;
        }
    
        showLoading();
    
        try {
            let response;
            let successMessage;
    
            if (isEditMode) {
                const id = parseInt(diamondIdInput.value);
                response = await fetch(`/api/diamonds/${id}`, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(diamondData)
                });
                successMessage = 'Diamond updated successfully';
            } else {
                response = await fetch('/api/diamonds', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(diamondData)
                });
                successMessage = 'Diamond added successfully';
            }
    
            if (!response.ok) {
                const errorData = await response.json();
                const errorMessage = errorData.error?.message || 'Unknown error occurred';
                throw new Error(errorMessage);
            }
    
            closeModal();
            await fetchDiamonds();
            // Fetch metadata to refresh any UI displaying quotations
            await fetchMetadata();
            showToast(successMessage, 'success');
        } catch (error) {
            showToast(`Error saving diamond: ${error.message}`, 'error');
            console.error('Error:', error);
        } finally {
            hideLoading();
        }
    }
    
    // Add function to fetch metadata
    async function fetchMetadata() {
        try {
            const response = await fetch('/api/metadata');
            if (!response.ok) throw new Error('Failed to fetch metadata');
            const metadata = await response.json();
            // Update UI if you have a metadata table or display
            // Example: renderMetadata(metadata);
        } catch (error) {
            showToast('Error loading metadata', 'error');
            console.error('Error:', error);
        }
    }
    
    async function handleDelete() {
        const id = parseInt(document.getElementById('deleteDiamondId').value);
        if (!id) return;
        
        showLoading();
        
        try {
            const response = await fetch(`/api/diamonds/${id}`, {
                method: 'DELETE'
            });
            
            if (!response.ok) throw new Error('Failed to delete diamond');
            
            closeDeleteModal();
            await fetchDiamonds();
            showToast('Diamond deleted successfully', 'success');
        } catch (error) {
            showToast('Error deleting diamond', 'error');
            console.error('Error:', error);
        } finally {
            hideLoading();
        }
    }
    
    function showToast(message, type = 'success') {
        toast.textContent = message;
        toast.className = 'toast';
        
        switch (type) {
            case 'success':
                toast.style.backgroundColor = 'var(--success-color)';
                break;
            case 'error':
                toast.style.backgroundColor = 'var(--danger-color)';
                break;
            case 'warning':
                toast.style.backgroundColor = 'var(--warning-color)';
                break;
            default:
                toast.style.backgroundColor = 'var(--info-color)';
        }
        
        toast.classList.add('show');
        setTimeout(() => {
            toast.classList.remove('show');
        }, 3000);
    }
    
    function showLoading() {
        loadingSpinner.classList.add('active');
    }
    
    function hideLoading() {
        loadingSpinner.classList.remove('active');
    }
}); 