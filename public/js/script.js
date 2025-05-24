
$(document).ready(function() {
    // Global variables
    let fetchedDiamondsData = [];
    let currentImageUrls = [];
    let metalPrices = {};

    // DOM Elements
    const $loadingSpinner = $('#loadingSpinner');

    // Show loading spinner
    function showLoading() {
        $loadingSpinner.css('display', 'flex');
    }

    // Hide loading spinner
    function hideLoading() {
        $loadingSpinner.hide();
    }

    // --- START: Custom Popup Modal Logic ---
    const popupModal = $('#customPopupModal');
    const popupTitle = $('#customPopupTitle');
    const popupMessage = $('#customPopupMessage');
    const popupCloseBtn = $('#customPopupCloseBtn');
    const popupOkBtn = $('#customPopupOkBtn');
    const popupConfirmBtn = $('#customPopupConfirmBtn');
    const popupCancelBtn = $('#customPopupCancelBtn');
    const popupHeader = $('.popup-modal-header');

    let confirmationCallback = null;

    function showPopup(message, type = 'info', title = 'Notification') {
        // // console.log('showPopup called with:', { message, type, title });
        try {
            popupTitle.text(title || 'Notification');
            popupMessage.html(message || 'No message provided');
            popupHeader.removeClass('success error warning info').addClass(type);
            popupOkBtn.show();
            popupConfirmBtn.hide();
            popupCancelBtn.hide();
            popupModal.css('display', 'flex');
        } catch (error) {
            console.error('Error in showPopup:', error);
        }
    }

    function showConfirmation(message, title = 'Confirm Action', callback) {
        // // console.log('showConfirmation called with:', { message, title });
        popupTitle.text(title);
        popupMessage.html(message);
        confirmationCallback = callback;
        popupHeader.removeClass('success error warning info').addClass('warning');
        popupOkBtn.hide();
        popupConfirmBtn.show();
        popupCancelBtn.show();
        popupModal.css('display', 'flex');
    }

    function hidePopup() {
        popupModal.hide();
    }

    function resetConfirmationCallback() {
        confirmationCallback = null;
    }

    popupCloseBtn.on('click', function() {
        if (confirmationCallback) {
            confirmationCallback(false);
        }
        hidePopup();
        resetConfirmationCallback();
    });

    popupOkBtn.on('click', function() {
        hidePopup();
    });

    popupConfirmBtn.on('click', function() {
        // // console.log('Confirm button clicked');
        if (confirmationCallback) {
            popupModal.css('display', 'none');
            confirmationCallback(true);
        }
        resetConfirmationCallback();
    });

    popupCancelBtn.on('click', function() {
        if (confirmationCallback) {
            confirmationCallback(false);
        }
        hidePopup();
        resetConfirmationCallback();
    });

    popupModal.on('click', function(event) {
        if (event.target === this) {
            if (confirmationCallback) {
                confirmationCallback(false);
            }
            hidePopup();
            resetConfirmationCallback();
        }
    });
    // --- END: Custom Popup Modal Logic ---

    // Initialize image modal
    $('#imageModal').hide();
    $('#modalImageContent').attr('src', '');
    $('#imageModalCaption').text('');

    // Navbar toggle
    const menu = document.getElementById('mobile-menu');
    const navMenu = document.getElementById('nav-menu-list');

    if (menu && navMenu) {
        menu.addEventListener('click', () => {
            menu.classList.toggle('is-active');
            navMenu.classList.toggle('active');
        });

        const navLinks = navMenu.querySelectorAll('.nav-links');
        navLinks.forEach(link => {
            link.addEventListener('click', () => {
                if (navMenu.classList.contains('active')) {
                    menu.classList.remove('is-active');
                    navMenu.classList.remove('active');
                }
            });
        });
    }

    // Metal purity options
    const metalPurityOptions = [
        { value: "10KT", text: "10KT Gold" },
        { value: "14KT", text: "14KT Gold" },
        { value: "18KT", text: "18KT Gold" },
        { value: "22KT", text: "22KT Gold" },
        { value: "24KT", text: "24KT Gold" },
        { value: "Silver", text: "Silver" },
        { value: "Platinum", text: "Platinum" }
    ];

    // Fetch metal prices and diamond data
    showLoading();
    $.getJSON('/api/prices', function(data) {
        metalPrices = data;
        // // console.log('Metal prices fetched:', metalPrices);
    }).fail(function(jqXHR, textStatus, errorThrown) {
        console.error('Failed to fetch metal prices:', textStatus, errorThrown);
        showPopup('Error: Could not load metal prices. Using default prices.', 'error', 'Metal Prices Load Error');
        metalPrices = {
            "10KT": 4410,
            "14KT": 6077,
            "18KT": 7448,
            "22KT": 9016,
            "24KT": 9800,
            "Silver": 100,
            "Platinum": 3200
        };
    }).always(function() {
        $.getJSON('/api/diamonds', function(data) {
            fetchedDiamondsData = data;
            if (Array.isArray(fetchedDiamondsData)) {
                fetchedDiamondsData = fetchedDiamondsData.map(d => ({...d, SHAPE: d.SHAPE ? d.SHAPE.trim() : ''}));
            } else {
                console.error("Fetched diamond data is not an array:", fetchedDiamondsData);
                fetchedDiamondsData = [];
            }
            initializeDiamondSection();
        }).fail(function(jqXHR, textStatus, errorThrown) {
            console.error("Failed to fetch diamond data:", textStatus, errorThrown);
            showPopup("Error: Could not load diamond data.", 'error', 'Data Load Error');
            fetchedDiamondsData = [];
            initializeDiamondSection();
        }).always(function() {
            setTimeout(() => {
                // console.log('Hiding spinner after data fetches');
                hideLoading();
                createMetalEntryForm('#metalEntriesContainer', metalPurityOptions);
            }, 100);
        });
    });

    $('.shape-select, .shape-mm-select, .category-select').select2({ width: '100%', theme: 'default' });

    function initializeSelect2ForMetalEntry(entryElement) {
        entryElement.find('.metalPuritySelect').select2({ width: '100%', theme: 'default' });
    }

    function createMetalEntryForm(containerSelector, options) {
        const entryId = `metalEntry-${Date.now()}`;
        let optionsHtml = '<option value="">Select Metal & Purity</option>';
        options.forEach(opt => {
            optionsHtml += `<option value="${opt.value}">${opt.text}</option>`;
        });

        const entryHtml = `
            <div class="metal-entry" id="${entryId}" data-entry-type="metal">
                <div class="form-row">
                    <div class="form-group">
                        <label>Metal & Purity</label>
                        <select class="metalPuritySelect" required>${optionsHtml}</select>
                    </div>
                    <div class="form-group">
                        <label>Grams</label>
                        <input type="number" class="grm" placeholder="e.g., 10.5" step="0.01" required>
                    </div>
                    <div class="form-group">
                        <label>Rate/Gram (₹)</label>
                        <input type="number" class="rateGrm" readonly required>
                    </div>
                </div>
                <div class="form-row">
                    <div class="form-group">
                        <label>Total Metal Amount (₹)</label>
                        <input type="number" class="totalMetalValue" readonly required>
                    </div>
                    <div class="form-group">
                        <label>Making Charges (₹)</label>
                        <input type="number" class="makingCharges" readonly required>
                    </div>
                    <div class="form-group form-group-action">
                        <button class="btn btn-add add-metal-entry-to-table">Add to Quotation</button>
                    </div>
                </div>
            </div>
        `;
        const $newEntry = $(entryHtml);
        $(containerSelector).append($newEntry);
        initializeSelect2ForMetalEntry($newEntry);
    }

    function initializeDiamondSection() {
        const $diamondShapeSelect = $('#diamondShape');
        $diamondShapeSelect.empty().append('<option value="">Select Shape</option>');

        if (!fetchedDiamondsData || fetchedDiamondsData.length === 0) {
            $diamondShapeSelect.append(`<option value="OTHER">OTHER</option>`);
            $diamondShapeSelect.trigger('change');
            return;
        }

        const uniqueShapesSet = new Set(
            fetchedDiamondsData.map(item => item.SHAPE ? item.SHAPE.trim() : null).filter(shape => shape)
        );

        let finalShapes = Array.from(uniqueShapesSet);
        const otherIndex = finalShapes.indexOf("OTHER");
        if (otherIndex > -1) {
            finalShapes.splice(otherIndex, 1);
        }
        finalShapes.sort();
        finalShapes.push("OTHER");

        finalShapes.forEach(shape => {
            $diamondShapeSelect.append(`<option value="${shape}">${shape}</option>`);
        });
        $diamondShapeSelect.trigger('change');
    }

    $('#addMetalItemBtn').on('click', function() {
        showLoading();
        $('#addMetalItemBtn').prop('disabled', true).addClass('disabled');
        setTimeout(() => {
            $('#metalEntriesContainer').empty();
            createMetalEntryForm('#metalEntriesContainer', metalPurityOptions);
            hideLoading();
            $('#addMetalItemBtn').prop('disabled', false).removeClass('disabled');
        }, 300);
    });

    $(document).on('change input', '.metal-entry .metalPuritySelect, .metal-entry .grm', function() {
        const entry = $(this).closest('.metal-entry');
        const grmVal = entry.find('.grm').val();
        const grm = parseFloat(grmVal) || 0;
        const selectedPurityValue = entry.find('.metalPuritySelect').val();

        if (grm > 0 && selectedPurityValue) {
            const rateGrm = metalPrices[selectedPurityValue] || 0;
            entry.find('.rateGrm').val(rateGrm.toFixed(2));
            const totalMetal = grm * rateGrm;
            entry.find('.totalMetalValue').val(totalMetal.toFixed(2));
            let makingChargeRate;
            if (['10KT', '14KT', '18KT', '22KT', '24KT'].includes(selectedPurityValue)) {
                makingChargeRate = 800;
            } else if (selectedPurityValue === 'Silver') {
                makingChargeRate = 250;
            } else if (selectedPurityValue === 'Platinum') {
                makingChargeRate = 1250;
            } else {
                makingChargeRate = 0;
            }
            const makingCharges = makingChargeRate * grm;
            entry.find('.makingCharges').val(makingCharges.toFixed(2));
        } else {
            entry.find('.rateGrm, .totalMetalValue, .makingCharges').val('');
        }
    });

    function getTableHeaders($table) {
        return $table.find('thead th').map((i, th) => $(th).text().trim()).get();
    }

    $(document).on('click', '.add-metal-entry-to-table', function() {
        const entry = $(this).closest('.metal-entry');
        const purityValue = entry.find('.metalPuritySelect').val();
        const grm = entry.find('.grm').val();
        const rateGrm = entry.find('.rateGrm').val();
        const totalMetal = entry.find('.totalMetalValue').val();
        const makingCharges = entry.find('.makingCharges').val();

        if (!purityValue || !grm || !rateGrm || !totalMetal || !makingCharges) {
            showPopup('Please fill all metal fields.', 'warning', 'Incomplete Metal Details');
            return;
        }

        const grmNum = parseFloat(grm);
        const rateGrmNum = parseFloat(rateGrm);
        const totalMetalNum = parseFloat(totalMetal);
        const makingChargesNum = parseFloat(makingCharges);

        if (isNaN(grmNum) || grmNum <= 0 ||
            isNaN(rateGrmNum) || rateGrmNum <= 0 ||
            isNaN(totalMetalNum) || totalMetalNum <= 0 ||
            isNaN(makingChargesNum) || makingChargesNum <= 0) {
            showPopup('Please enter valid positive values for all metal fields.', 'warning', 'Invalid Metal Values');
            return;
        }

        const total = (totalMetalNum + makingChargesNum).toFixed(2);

        const $table = $('#metalTable');
        const headers = getTableHeaders($table);
        const values = [
            purityValue,
            grmNum.toFixed(2),
            rateGrmNum.toFixed(2),
            totalMetalNum.toFixed(2),
            makingChargesNum.toFixed(2),
            total,
            '<button class="btn btn-remove remove-metal-row">Remove</button>'
        ];

        let newRowHtml = '<tr>';
        values.forEach((val, index) => {
            newRowHtml += `<td data-label="${headers[index] || ''}">${val}</td>`;
        });
        newRowHtml += '</tr>';

        $table.find('tbody').append(newRowHtml);
        updateMetalSummaryTable();
        updateTotalMetalAmountsAndSummary();
        entry.remove();
        showPopup('Metal item added successfully!', 'success', 'Metal Added');
        createMetalEntryForm('#metalEntriesContainer', metalPurityOptions);
    });

    $(document).on('click', '.remove-metal-row', function() {
        $(this).closest('tr').remove();
        updateMetalSummaryTable();
        updateTotalMetalAmountsAndSummary();
    });

    function updateTotalMetalAmountsAndSummary() {
        $('#summaryIdSku').text($('#itemIdSku').val().trim() || '-');
        $('#summaryCategory').text($('#itemCategory').val() || '-');
        updateMetalSummaryTable();
    }

    function updateMetalSummaryTable() {
        const $summaryTableBody = $('#metalSummaryTable tbody');
        $summaryTableBody.empty();
    
        const headers = getTableHeaders($('#metalSummaryTable'));
        const totalDiamondAmount = parseFloat($('#totalDiamondAmount').val()) || 0;
    
        $('#metalTable tbody tr').each(function() {
            const $row = $(this);
            const totalMetal = parseFloat($row.find('td:nth-child(4)').text()) || 0;
            const makingCharges = parseFloat($row.find('td:nth-child(5)').text()) || 0;
            const total = (totalMetal + makingCharges + totalDiamondAmount).toFixed(2);
    
            const values = [
                $row.find('td:nth-child(1)').text(),
                $row.find('td:nth-child(2)').text(),
                $row.find('td:nth-child(3)').text(),
                totalMetal.toFixed(2),
                makingCharges.toFixed(2),
                totalDiamondAmount.toFixed(2),
                total
            ];
    
            let rowHtml = '<tr>';
            values.forEach((val, index) => {
                rowHtml += `<td data-label="${headers[index] || ''}">${val}</td>`;
            });
            rowHtml += '</tr>';
            $summaryTableBody.append(rowHtml);
        });
    }

    $('#diamondShape').on('change', function() {
        const selectedShape = $(this).val();
        // console.log('Diamond Shape changed to:', selectedShape);
        const $shapeMmDropdown = $('#shapeMmDropdown');
        $shapeMmDropdown.empty().append('<option value="">Select Shape & MM</option>');
        $('#diamondMm').val('').prop('readonly', false);
        $('#priceCt').val('');
        $('#manualPriceContainer').removeClass('visible').hide();
        $('#manualPriceCt').val('');

        if (selectedShape === 'OTHER') {
            $('#diamondMm').val('Other').prop('readonly', true);
            $shapeMmDropdown.prop('disabled', true);
            $('#manualPriceContainer').addClass('visible').show();
            $('#priceCt').val('').prop('readonly', true);
        } else if (selectedShape) {
            $shapeMmDropdown.prop(' disabled', false);
            const filteredDiamonds = fetchedDiamondsData.filter(d => d.SHAPE === selectedShape);
            filteredDiamonds.forEach(diamond => {
                $shapeMmDropdown.append(`<option value="${diamond["MM & SHAPE"]}" data-mm="${diamond.MM}" data-price="${diamond["PRICE/CT"]}">${diamond["MM & SHAPE"]}</option>`);
            });
        }
        $shapeMmDropdown.trigger('change');
        calculateDiamondTotal();
    });

    $('#shapeMmDropdown').on('change', function() {
        const selectedOption = $(this).find('option:selected');
        const mmValue = selectedOption.data('mm');
        const priceCt = selectedOption.data('price');

        if (mmValue !== undefined) {
            $('#diamondMm').val(mmValue);
            $('#priceCt').val(priceCt !== undefined ? parseFloat(priceCt).toFixed(2) : '');
        } else {
            if ($('#diamondShape').val() !== 'OTHER') {
                $('#diamondMm').val('');
            }
            $('#priceCt').val('');
        }
        calculateDiamondTotal();
    });

    $('#manualPriceCt').on('input', function() {
        if ($('#diamondShape').val() === 'OTHER') {
            const manualPrice = parseFloat($(this).val()) || 0;
            $('#priceCt').val(manualPrice.toFixed(2));
            calculateDiamondTotal();
        }
    });

    $('#diamondPcs, #weightPcs').on('input', function() {
        calculateTotalWeight();
        calculateDiamondTotal();
    });

    $('#diamondMm').on('input', function() {
        if ($('#diamondShape').val() === 'OTHER' || $('#shapeMmDropdown').val()) return;

        const manualMm = $(this).val();
        const selectedShape = $('#diamondShape').val();
        $('#priceCt').val('');

        if (selectedShape && manualMm) {
            const matchingDiamond = fetchedDiamondsData.find(d => d.SHAPE === selectedShape && String(d.MM).trim() === String(manualMm).trim());
            if (matchingDiamond) {
                $('#priceCt').val(parseFloat(matchingDiamond["PRICE/CT"]).toFixed(2));
                $('#shapeMmDropdown').val(matchingDiamond["MM & SHAPE"]).trigger('change.select2');
            }
        }
        calculateDiamondTotal();
    });

    function calculateTotalWeight() {
        const pcs = parseFloat($('#diamondPcs').val()) || 0;
        const weightPcs = parseFloat($('#weightPcs').val()) || 0;
        $('#totalWeight').val((pcs * weightPcs).toFixed(2));
    }

    function calculateDiamondTotal() {
        const totalWeight = parseFloat($('#totalWeight').val()) || 0;
        let priceCtVal;

        if ($('#diamondShape').val() === 'OTHER') {
            priceCtVal = parseFloat($('#manualPriceCt').val()) || 0;
            if (document.activeElement === document.getElementById('manualPriceCt')) {
                $('#priceCt').val(priceCtVal.toFixed(2));
            }
        } else {
            priceCtVal = parseFloat($('#priceCt').val()) || 0;
        }

        $('#diamondTotal').val((totalWeight * priceCtVal).toFixed(2));
    }

    $('#addDiamondBtn').on('click', function() {
        showLoading();
        $('#addDiamondBtn').prop('disabled', true).addClass('disabled');

        const shape = $('#diamondShape').val();
        const mm = $('#diamondMm').val();
        const pcs = $('#diamondPcs').val();
        const weightPcs = $('#weightPcs').val();
        const totalWeight = $('#totalWeight').val();
        const priceCtEntry = $('#priceCt').val();
        const diamondTotalValue = $('#diamondTotal').val();

        // console.log('Adding diamond with values:', {
        //     shape,
        //     mm,
        //     pcs,
        //     weightPcs,
        //     totalWeight,
        //     priceCtEntry,
        //     diamondTotalValue
        // });

        if (!shape || !shape.trim()) {
            hideLoading();
            $('#addDiamondBtn').prop('disabled', false).removeClass('disabled');
            showPopup('Please select a valid Shape.', 'warning', 'Invalid Shape');
            return;
        }
        if (!mm || !pcs || !weightPcs || !totalWeight || !priceCtEntry || !diamondTotalValue) {
            hideLoading();
            $('#addDiamondBtn').prop('disabled', false).removeClass('disabled');
            showPopup('Please fill all diamond fields.', 'warning', 'Incomplete Diamond Details');
            return;
        }

        const pcsNum = parseFloat(pcs);
        const weightPcsNum = parseFloat(weightPcs);
        const totalWeightNum = parseFloat(totalWeight);
        const priceCtNum = parseFloat(priceCtEntry);
        const diamondTotalNum = parseFloat(diamondTotalValue);

        if (isNaN(pcsNum) || pcsNum <= 0 ||
            isNaN(weightPcsNum) || weightPcsNum <= 0 ||
            isNaN(totalWeightNum) || totalWeightNum <= 0 ||
            isNaN(priceCtNum) || priceCtNum <= 0 ||
            isNaN(diamondTotalNum) || diamondTotalNum <= 0) {
            hideLoading();
            $('#addDiamondBtn').prop('disabled', false).removeClass('disabled');
            showPopup('Please enter valid positive values for diamond fields.', 'warning', 'Invalid Diamond Values');
            return;
        }

        setTimeout(() => {
            const $table = $('#diamondTable');
            const headers = getTableHeaders($table);
            const values = [
                shape.trim(),
                mm.trim(),
                pcsNum.toFixed(0),
                weightPcsNum.toFixed(2),
                totalWeightNum.toFixed(2),
                priceCtNum.toFixed(2),
                diamondTotalNum.toFixed(2),
                '<button class="btn btn-remove remove-diamond">Remove</button>'
            ];

            let newRowHtml = '<tr>';
            values.forEach((val, index) => {
                newRowHtml += `<td data-label="${headers[index] || ''}">${val}</td>`;
            });
            newRowHtml += '</tr>';

            $table.find('tbody').append(newRowHtml);
            updateTotalDiamondAmount();
            resetDiamondForm();
            hideLoading();
            $('#addDiamondBtn').prop('disabled', false).removeClass('disabled');
            showPopup('Diamond added successfully!', 'success', 'Diamond Added');
        }, 300);
    });

    $(document).on('click', '.remove-diamond', function() {
        $(this).closest('tr').remove();
        updateTotalDiamondAmount();
    });

    function resetDiamondForm() {
        $('#diamondShape').val('').trigger('change');
        $('#diamondMm').val('');
        $('#diamondPcs').val('');
        $('#weightPcs').val('');
        $('#totalWeight').val('');
        $('#manualPriceCt').val('');
        $('#priceCt').val('');
        $('#diamondTotal').val('');
    }

    function updateTotalDiamondAmount() {
        let total = 0;
        $('#diamondTable tbody tr').each(function() {
            const totalValue = parseFloat($(this).find('td:nth-child(7)').text()) || 0;
            total += totalValue;
        });
        $('#totalDiamondAmount').val(total.toFixed(2));
        updateTotalMetalAmountsAndSummary();
    }

    function renderImagePreviews() {
        const $previewsContainer = $('#itemImagePreviews');
        $previewsContainer.empty();
        currentImageUrls = currentImageUrls.filter(url => url && url.startsWith('https://raw.githubusercontent.com/'));
        // console.log('Rendering image previews, currentImageUrls:', currentImageUrls.length);
        currentImageUrls.forEach((url, index) => {
            if (url && url.startsWith('https://raw.githubusercontent.com/')) {
                const $previewWrapper = $('<div class="image-preview-wrapper"></div>');
                const $img = $(`<img class="image-preview-input" src="${url}" alt="Image Preview ${index + 1}" data-index="${index}">`);
                const $removeBtn = $(`<button class="btn-remove-image" data-index="${index}" aria-label="Remove image ${index + 1}">X</button>`);
                $previewWrapper.append($img).append($removeBtn);
                $previewsContainer.append($previewWrapper);
            }
        });
        $('.image-input-wrapper').toggleClass('has-image', currentImageUrls.length > 0);
        $('#imageInputText').text(currentImageUrls.length > 0 ? `${currentImageUrls.length} image(s) uploaded` : 'Click to upload or drag & drop');
    }

    function renderSummaryImagePreviews() {
        const $summaryPreviewsContainer = $('#summaryImagePreviews');
        $summaryPreviewsContainer.empty();
        currentImageUrls = currentImageUrls.filter(url => url && url.startsWith('https://raw.githubusercontent.com/'));
        // console.log('Rendering summary image previews, currentImageUrls:', currentImageUrls.length);
        currentImageUrls.forEach((url, index) => {
            if (url && url.startsWith('https://raw.githubusercontent.com/')) {
                const $previewWrapper = $('<div class="image-preview-wrapper"></div>');
                const $img = $(`<img class="summary-image-preview" src="${url}" alt="Summary Image ${index + 1}" data-index="${index}">`);
                const $removeBtn = $(`<button class="btn-remove-image" data-index="${index}" aria-label="Remove image ${index + 1}">X</button>`);
                $previewWrapper.append($img).append($removeBtn);
                $summaryPreviewsContainer.append($previewWrapper);
            }
        });
    }

    $('.image-input-wrapper').on('dragover', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).addClass('dragover');
    }).on('dragleave', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('dragover');
    }).on('drop', function(e) {
        e.preventDefault();
        e.stopPropagation();
        $(this).removeClass('dragover');
        const files = e.originalEvent.dataTransfer.files;
        if (files && files.length > 0) {
            uploadImagesToGitHub(files);
        }
    });

    $('#itemImage').on('change', function(event) {
        const files = event.target.files;
        if (files && files.length > 0) {
            uploadImagesToGitHub(files);
            $(this).val('');
        }
    });

    function uploadImagesToGitHub(files) {
        const formData = new FormData();
        let validImages = false;

        Array.from(files).forEach(file => {
            if (!file.type.startsWith('image/')) {
                showPopup('Please drop only image files.', 'warning', 'Invalid File Type');
                return;
            }
            formData.append('images', file);
            validImages = true;
        });

        if (!validImages) {
            return;
        }

        showLoading();

        const uploadTimeout = setTimeout(() => {
            hideLoading();
            showPopup('Image upload timed out. Please try again.', 'error', 'Upload Timeout');
        }, 30000);

        fetch('/api/upload-image', {
            method: 'POST',
            body: formData
        })
        .then(response => {
            clearTimeout(uploadTimeout);
            if (!response.ok) {
                throw new Error(`HTTP error! Status: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            if (data.imageUrls && Array.isArray(data.imageUrls)) {
                currentImageUrls.push(...data.imageUrls);
                renderImagePreviews();
                renderSummaryImagePreviews();
                hideLoading();
                showPopup('Images uploaded successfully!', 'success', 'Image Upload Successful');
            } else {
                throw new Error('Invalid response from server');
            }
        })
        .catch(error => {
            console.error('Error uploading images:', error);
            clearTimeout(uploadTimeout);
            hideLoading();
            showPopup(`Error: Failed to upload images. ${error.message}`, 'error', 'Image Upload Failed');
        });
    }

    $(document).on('click', '.btn-remove-image', function(event) {
        event.stopPropagation();
        const index = $(this).data('index');
        const url = currentImageUrls[index];

        showConfirmation('Are you sure you want to delete this image?', 'Confirm Deletion', function(confirmed) {
            if (confirmed) {
                showLoading();
                fetch('/api/delete-image', {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ url })
                })
                .then(response => {
                    if (!response.ok) {
                        throw new Error(`HTTP error! Status: ${response.status}`);
                    }
                    return response.json();
                })
                .then(() => {
                    currentImageUrls.splice(index, 1);
                    renderImagePreviews();
                    renderSummaryImagePreviews();
                    hideLoading();
                    showPopup('Image deleted successfully!', 'success', 'Image Deletion Successful');
                })
                .catch(error => {
                    console.error('Error deleting image:', error);
                    hideLoading();
                    showPopup(`Error: Failed to delete image. ${error.message}`, 'error', 'Image Deletion Failed');
                });
            }
        });
    });

    $('#itemIdSku').on('input', function() {
        updateTotalMetalAmountsAndSummary();
    });

    $('#itemCategory').on('change', function() {
        updateTotalMetalAmountsAndSummary();
    });

    $('#resetQuotationBtn').on('click', function() {
        showConfirmation('Are you sure you want to reset all fields?', 'Confirm Reset', function(confirmed) {
            if (confirmed) {
                showLoading();
                setTimeout(() => {
                    try {
                        $('input[type="text"], input[type="number"]').val('');
                        $('select.category-select, select.shape-select, select.shape-mm-select').val('').trigger('change');
                        currentImageUrls = [];
                        renderImagePreviews();
                        renderSummaryImagePreviews();
                        $('#metalTable tbody').empty();
                        $('#diamondTable tbody').empty();
                        $('#metalSummaryTable tbody').empty();
                        $('#metalEntriesContainer').empty();
                        createMetalEntryForm('#metalEntriesContainer', metalPurityOptions);
                        $('#summaryIdSku').text('-');
                        $('#summaryCategory').text('-');
                        $('#totalDiamondAmount').val('');
                        updateTotalMetalAmountsAndSummary();
                        updateTotalDiamondAmount();
                        $('#imageModal').hide();
                        $('#modalImageContent').attr('src', '');
                        $('#imageModalCaption').text('');
                        hideLoading();
                        showPopup('Quotation form reset.', 'success', 'Form Reset');
                    } catch (error) {
                        console.error('Error during reset:', error);
                        hideLoading();
                        showPopup(`Error: Failed to reset quotation. ${error.message}`, 'error', 'Reset Failed');
                    }
                }, 300);
            }
        });
    });

    function getQuotationData(includeIdAndDate = true) {
        const quotationData = {
            identification: {
                idSku: $('#itemIdSku').val().trim(),
                category: $('#itemCategory').val(),
                images: currentImageUrls
            },
            metalItems: [],
            diamondItems: [],
            summary: {
                idSku: $('#summaryIdSku').text(),
                category: $('#summaryCategory').text(),
                totalDiamondAmount: $('#totalDiamondAmount').val() || '0.00',
                metalSummary: []
            }
        };

        if (includeIdAndDate) {
            quotationData.quotationId = getNextQuotationIdForStorage();
            quotationData.quotationDate = new Date().toISOString();
        }

        $('#metalTable tbody tr').each(function() {
            const $row = $(this);
            quotationData.metalItems.push({
                purity: $row.find('td:nth-child(1)').text().trim(),
                grams: $row.find('td:nth-child(2)').text().trim(),
                ratePerGram: $row.find('td:nth-child(3)').text().trim(),
                totalMetal: $row.find('td:nth-child(4)').text().trim(),
                makingCharges: $row.find('td:nth-child(5)').text().trim(),
                total: $row.find('td:nth-child(6)').text().trim()
            });
        });

        $('#diamondTable tbody tr').each(function() {
            const $row = $(this);
            quotationData.diamondItems.push({
                shape: $row.find('td:nth-child(1)').text().trim(),
                mm: $row.find('td:nth-child(2)').text().trim(),
                pcs: $row.find('td:nth-child(3)').text().trim(),
                weightPerPiece: $row.find('td:nth-child(4)').text().trim(),
                totalWeightCt: $row.find('td:nth-child(5)').text().trim(),
                pricePerCt: $row.find('td:nth-child(6)').text().trim(),
                total: $row.find('td:nth-child(7)').text().trim()
            });
        });

        $('#metalSummaryTable tbody tr').each(function() {
            const $row = $(this);
            quotationData.summary.metalSummary.push({
                purity: $row.find('td:nth-child(1)').text().trim(),
                grams: $row.find('td:nth-child(2)').text().trim(),
                ratePerGram: $row.find('td:nth-child(3)').text().trim(),
                totalMetal: $row.find('td:nth-child(4)').text().trim(),
                makingCharges: $row.find('td:nth-child(5)').text().trim(),
                totalDiamondAmount: $row.find('td:nth-child(6)').text().trim(),
                total: $row.find('td:nth-child(7)').text().trim()
            });
        });

        return quotationData;
    }

    function getNextQuotationIdForStorage() {
        let lastId = localStorage.getItem('lastQuotationId');
        lastId = lastId ? parseInt(lastId, 10) : 0;
        const nextId = lastId + 1;
        localStorage.setItem('lastQuotationId', nextId);
        return `Q-${String(nextId).padStart(5, '0')}`;
    }

    $('#saveQuotationJsonBtn').on('click', function() {
        // console.log('Save Quotation button clicked');
        const idSku = $('#itemIdSku').val().trim();
        const category = $('#itemCategory').val();
        const metalRows = $('#metalTable tbody tr');
        const diamondRows = $('#diamondTable tbody tr');

        if (!idSku) {
            showPopup('ID/SKU is required.', 'warning', 'Missing ID/SKU');
            return;
        }

        if (!category) {
            showPopup('Category is required.', 'warning', 'Missing Category');
            return;
        }

        if (metalRows.length === 0) {
            showPopup('At least one metal item is required.', 'warning', 'Missing Metal Details');
            return;
        }

        if (diamondRows.length === 0) {
            showPopup('At least one diamond item is required.', 'warning', 'Missing Diamond Details');
            return;
        }

        let metalValid = true;
        const metalHeaders = getTableHeaders($('#metalTable'));
        // console.log('Metal headers:', metalHeaders);
        metalRows.each(function(index) {
            const $row = $(this);
            const fields = [
                $row.find('td:nth-child(1)').text().trim(),
                $row.find('td:nth-child(2)').text().trim(),
                $row.find('td:nth-child(3)').text().trim(),
                $row.find('td:nth-child(4)').text().trim(),
                $row.find('td:nth-child(5)').text().trim(),
                $row.find('td:nth-child(6)').text().trim()
            ];
            // console.log(`Metal row ${index + 1} fields:`, fields);
            const invalidFields = fields.map((field, i) => {
                if (!field || field.trim() === '') {
                    // console.log(`Invalid metal field in row ${index + 1}: ${metalHeaders[i]} = "${field}"`);
                    return metalHeaders[i];
                }
                if (i > 0) {
                    const num = parseFloat(field);
                    if (isNaN(num) || num <= 0) {
                        // console.log(`Invalid metal number in row ${index + 1}: ${metalHeaders[i]} = "${field}"`);
                        return metalHeaders[i];
                    }
                }
                return null;
            }).filter(f => f);
            if (invalidFields.length > 0) {
                metalValid = false;
                showPopup(`Invalid values in metal row ${index + 1}: ${invalidFields.join(', ')}`, 'warning', 'Invalid Metal Details');
                return false;
            }
        });

        if (!metalValid) {
            return;
        }

        let diamondValid = true;
        const diamondHeaders = getTableHeaders($('#diamondTable'));
        // console.log('Diamond headers:', diamondHeaders);
        diamondRows.each(function(index) {
            const $row = $(this);
            const fields = [
                $row.find('td:nth-child(1)').text().trim(),
                $row.find('td:nth-child(2)').text().trim(),
                $row.find('td:nth-child(3)').text().trim(),
                $row.find('td:nth-child(4)').text().trim(),
                $row.find('td:nth-child(5)').text().trim(),
                $row.find('td:nth-child(6)').text().trim(),
                $row.find('td:nth-child(7)').text().trim()
            ];
            // console.log(`Diamond row ${index + 1} fields:`, fields);
            const invalidFields = fields.map((field, i) => {
                if (!field || field.trim() === '') {
                    // console.log(`Invalid diamond field in row ${index + 1}: ${diamondHeaders[i]} = "${field}"`);
                    return diamondHeaders[i];
                }
                if (i > 1) {
                    const num = parseFloat(field);
                    if (isNaN(num) || num <= 0) {
                        // console.log(`Invalid diamond number in row ${index + 1}: ${diamondHeaders[i]} = "${field}"`);
                        return diamondHeaders[i];
                    }
                }
                return null;
            }).filter(f => f);
            if (invalidFields.length > 0) {
                diamondValid = false;
                showPopup(`Invalid values in diamond row ${index + 1}: ${invalidFields.join(', ')}`, 'warning', 'Invalid Diamond Details');
                return false;
            }
        });

        if (!diamondValid) {
            return;
        }

        const quotationData = getQuotationData();
        // console.log('Quotation data to save:', JSON.stringify(quotationData, null, 2));

        showLoading();
        $('#saveQuotationJsonBtn').prop('disabled', true).addClass('disabled');
        $('#saveLoader').show();

        $.ajax({
            url: '/api/save-quotation',
            method: 'POST',
            contentType: 'application/json',
            data: JSON.stringify(quotationData),
            success: function(response) {
                // console.log('Quotation saved successfully:', response);
                hideLoading();
                $('#saveLoader').hide();
                $('#saveQuotationJsonBtn').prop('disabled', false).removeClass('disabled');
                showPopup('Quotation saved successfully!', 'success', 'Save Successful');
                resetQuotationForm();
            },
            error: function(jqXHR, textStatus, errorThrown) {
                console.error('Failed to save quotation:', textStatus, errorThrown);
                let errorMessage = 'Failed to save quotation.';
                if (jqXHR.responseJSON && jqXHR.responseJSON.error) {
                    errorMessage += ` ${jqXHR.responseJSON.error.message}`;
                }
                hideLoading();
                $('#saveLoader').hide();
                $('#saveQuotationJsonBtn').prop('disabled', false).removeClass('disabled');
                showPopup(errorMessage, 'error', 'Save Failed');
            }
        });
    });

    function resetQuotationForm() {
        $('input[type="text"], input[type="number"]').val('');
        $('select.category-select, select.shape-select, select.shape-mm-select').val('').trigger('change');
        currentImageUrls = [];
        renderImagePreviews();
        renderSummaryImagePreviews();
        $('#metalTable tbody').empty();
        $('#diamondTable tbody').empty();
        $('#metalSummaryTable tbody').empty();
        $('#metalEntriesContainer').empty();
        createMetalEntryForm('#metalEntriesContainer', metalPurityOptions);
        $('#summaryIdSku').text('-');
        $('#summaryCategory').text('-');
        $('#totalDiamondAmount').val('');
        updateTotalMetalAmountsAndSummary();
        updateTotalDiamondAmount();
        $('#imageModal').hide();
        $('#modalImageContent').attr('src', '');
        $('#imageModalCaption').text('');
    }

    $('#downloadExcelBtn').on('click', function() {
        // console.log('Download Excel button clicked');
        const quotationData = getQuotationData(true); // Include quotationId and quotationDate
        if (!quotationData.identification.idSku || !quotationData.identification.category ||
            quotationData.metalItems.length === 0 || quotationData.diamondItems.length === 0) {
            showPopup('Please complete all required fields before downloading.', 'warning', 'Incomplete Data');
            return;
        }
    
        const wb = XLSX.utils.book_new();
    
        // Identification Details Sheet
        const identificationData = [{
            'Quotation ID': quotationData.quotationId || 'N/A',
            'SKU ID': quotationData.identification.idSku,
            'Category': quotationData.identification.category,
            'Date': quotationData.quotationDate ? new Date(quotationData.quotationDate).toLocaleString() : 'N/A',
            'Images': quotationData.identification.images.join(', ')
        }];
        const identificationWs = XLSX.utils.json_to_sheet(identificationData);
        XLSX.utils.book_append_sheet(wb, identificationWs, 'Identification');
    
        // Metal Details Sheet
        const metalData = quotationData.metalItems.map((item, index) => ({
            'S.No': index + 1,
            'Metal & Purity': item.purity,
            'Grams': item.grams,
            'Rate/Gram (₹)': item.ratePerGram,
            'Total Metal (₹)': item.totalMetal,
            'Making Charges (₹)': item.makingCharges,
            'Total (₹)': item.total
        }));
        const metalWs = XLSX.utils.json_to_sheet(metalData);
        XLSX.utils.book_append_sheet(wb, metalWs, 'Metal Details');
    
        // Diamond Details Sheet
        const diamondData = quotationData.diamondItems.map((item, index) => ({
            'S.No': index + 1,
            'Shape': item.shape,
            'MM': item.mm,
            'PCS': item.pcs,
            'Weight/PCS': item.weightPerPiece,
            'Total Weight/CT': item.totalWeightCt,
            'Price/CT': item.pricePerCt,
            'Total (₹)': item.total
        }));
        const diamondWs = XLSX.utils.json_to_sheet(diamondData);
        XLSX.utils.book_append_sheet(wb, diamondWs, 'Diamond Details');
    
        // Summary Sheet
        const summaryData = quotationData.summary.metalSummary.map((item, index) => ({
            'S.No': index + 1,
            'Metal & Purity': item.purity,
            'Grams': item.grams,
            'Rate/Gram (₹)': item.ratePerGram,
            'Total Metal (₹)': item.totalMetal,
            'Making Charges (₹)': item.makingCharges,
            'Total Diamond Amount (₹)': item.totalDiamondAmount,
            'Total (₹)': item.total
        }));
        // Add identification details at the top of the summary sheet
        summaryData.unshift(
            {
                'S.No': '',
                'Metal & Purity': 'Quotation ID',
                'Grams': quotationData.quotationId || 'N/A',
                'Rate/Gram (₹)': '',
                'Total Metal (₹)': '',
                'Making Charges (₹)': '',
                'Total Diamond Amount (₹)': '',
                'Total (₹)': ''
            },
            {
                'S.No': '',
                'Metal & Purity': 'SKU ID',
                'Grams': quotationData.identification.idSku,
                'Rate/Gram (₹)': '',
                'Total Metal (₹)': '',
                'Making Charges (₹)': '',
                'Total Diamond Amount (₹)': '',
                'Total (₹)': ''
            },
            {
                'S.No': '',
                'Metal & Purity': 'Category',
                'Grams': quotationData.identification.category,
                'Rate/Gram (₹)': '',
                'Total Metal (₹)': '',
                'Making Charges (₹)': '',
                'Total Diamond Amount (₹)': '',
                'Total (₹)': ''
            },
            {
                'S.No': '',
                'Metal & Purity': 'Date',
                'Grams': quotationData.quotationDate ? new Date(quotationData.quotationDate).toLocaleString() : 'N/A',
                'Rate/Gram (₹)': '',
                'Total Metal (₹)': '',
                'Making Charges (₹)': '',
                'Total Diamond Amount (₹)': '',
                'Total (₹)': ''
            }
        );
        const summaryWs = XLSX.utils.json_to_sheet(summaryData);
        XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');
    
        const fileName = `Quotation_${quotationData.identification.idSku || 'Untitled'}_${new Date().toISOString().split('T')[0]}.xlsx`;
        XLSX.writeFile(wb, fileName);
        showPopup('Excel file downloaded successfully!', 'success', 'Download Successful');
    });

    $(document).on('click', '.image-preview-input, .summary-image-preview', function() {
        const src = $(this).attr('src');
        const index = $(this).data('index');
        $('#modalImageContent').attr('src', src);
        $('#imageModalCaption').text(`Image ${index + 1}`);
        $('#imageModal').show();
    });

    $('#imageModalClose').on('click', function() {
        $('#imageModal').hide();
        $('#modalImageContent').attr('src', '');
        $('#imageModalCaption').text('');
    });

    $('#imageModal').on('click', function(event) {
        if (event.target === this) {
            $('#imageModal').hide();
            $('#modalImageContent').attr('src', '');
            $('#imageModalCaption').text('');
        }
    });

    updateTotalMetalAmountsAndSummary();
    updateTotalDiamondAmount();
});