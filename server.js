const express = require('express');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const { Octokit } = require('@octokit/rest');
const sharp = require('sharp');
require('dotenv').config();

// Initialize Express
const app = express();
const PORT = process.env.PORT || 3000;

// Construct service account credentials from environment variables
const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);

// Initialize Firebase Admin
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: 'lepdo-793ba.appspot.com'
});

const db = admin.firestore();

// Initialize Cloud Storage
const storage = new Storage({
    credentials: serviceAccount,
    projectId: serviceAccount.project_id
});
const bucket = storage.bucket('lepdo-793ba.appspot.com');

// Initialize Octokit for GitHub API
const octokit = new Octokit({
    auth: process.env.GITHUB_TOKEN
});

// Configure Multer for file uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 } // 10MB limit
});

// Middleware
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Valid shapes for diamonds
const VALID_SHAPES = ['ROUND', 'OVAL', 'PEAR', 'EMERALD', 'PRINCESS', 'CUSHION', 'ASSCHER'];

// Helper function to estimate document size (in bytes)
function getDocumentSize(doc) {
    return Buffer.byteLength(JSON.stringify(doc), 'utf8');
}

// Helper function to sanitize data
function sanitizeData(obj) {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(item => sanitizeData(item));
    if (typeof obj !== 'object' || obj instanceof Date) return obj;
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null) {
            result[key] = null;
        } else if (typeof value === 'object' && !(value instanceof Date)) {
            result[key] = sanitizeData(value);
        } else if (typeof value !== 'function' && !Number.isNaN(value)) {
            result[key] = value;
        } else {
            console.warn(`Removing invalid value for key ${key}: ${value}`);
        }
    }
    return result;
}

// Updated endpoint to handle image uploads to GitHub with compression
app.post('/api/upload-image', upload.array('images'), async (req, res) => {
    try {
        // Validate environment variables
        if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
            console.error('Missing GitHub environment variables:', {
                token: process.env.GITHUB_TOKEN ? 'Set' : 'Not Set',
                owner: process.env.GITHUB_OWNER,
                repo: process.env.GITHUB_REPO
            });
            return res.status(500).json({ error: { message: 'Server configuration error: Missing GitHub credentials' } });
        }

        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ error: { message: 'No images provided' } });
        }

        const uploadPromises = req.files.map(async (file) => {
            const fileName = `${Date.now()}_${file.originalname.replace(/\s+/g, '_')}`;
            const filePath = `images/${fileName}`; // Store images in an 'images' folder

            // Compress image using sharp
            let compressedBuffer;
            try {
                compressedBuffer = await sharp(file.buffer)
                    .resize({ width: 1024, withoutEnlargement: true }) // Resize to max 1024px width, don't enlarge
                    .jpeg({ quality: 80 }) // Convert to JPEG with 80% quality
                    .toBuffer();
            } catch (sharpErr) {
                console.error(`Error compressing image ${fileName}:`, sharpErr);
                throw new Error(`Failed to compress image: ${sharpErr.message}`);
            }

            // Convert compressed buffer to base64
            const content = compressedBuffer.toString('base64');

            // Upload file to GitHub
            try {
                const response = await octokit.repos.createOrUpdateFileContents({
                    owner: process.env.GITHUB_OWNER,
                    repo: process.env.GITHUB_REPO,
                    path: filePath,
                    message: `Upload image ${fileName}`,
                    content: content,
                    branch: 'main'
                });

                // Return raw GitHub URL
                const rawUrl = `https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/main/${filePath}`;
                return rawUrl;
            } catch (githubErr) {
                console.error(`Error uploading ${fileName} to GitHub:`, githubErr);
                if (githubErr.status === 403 && githubErr.message.includes('rate limit')) {
                    return res.status(429).json({ error: { message: 'GitHub API rate limit exceeded. Try again later.' } });
                }
                throw githubErr;
            }
        });

        const imageUrls = await Promise.all(uploadPromises);
        res.status(200).json({ imageUrls });
    } catch (err) {
        console.error('Error uploading images to GitHub:', err);
        res.status(500).json({ error: { message: 'Failed to upload images', details: err.message } });
    }
});

// Endpoint to delete images from GitHub
app.delete('/api/delete-image', async (req, res) => {
    try {
        const { url } = req.body;
        if (!url || !url.startsWith(`https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/`)) {
            return res.status(400).json({ error: { message: 'Invalid or missing image URL' } });
        }

        // Extract file path from URL
        const filePath = url.split(`https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/main/`)[1];

        // Get the file's SHA
        const { data } = await octokit.repos.getContent({
            owner: process.env.GITHUB_OWNER,
            repo: process.env.GITHUB_REPO,
            path: filePath
        });

        // Delete the file
        await octokit.repos.deleteFile({
            owner: process.env.GITHUB_OWNER,
            repo: process.env.GITHUB_REPO,
            path: filePath,
            message: `Delete image ${filePath}`,
            sha: data.sha,
            branch: 'main'
        });

        res.status(200).json({ message: 'Image deleted successfully' });
    } catch (err) {
        console.error('Error deleting image from GitHub:', err);
        res.status(500).json({ error: { message: 'Failed to delete image', details: err.message } });
    }
});

// Get all diamonds
app.get('/api/diamonds', async (req, res) => {
    try {
        const snapshot = await db.collection('diamonds').get();
        const diamonds = snapshot.docs.map(doc => ({ id: parseInt(doc.id), ...doc.data() }));
        res.json(diamonds);
    } catch (err) {
        console.error('Error fetching diamonds:', err);
        res.status(500).json({ error: { message: 'Failed to load diamond data' } });
    }
});

// Add a new diamond
// Remove the VALID_SHAPES array
// const VALID_SHAPES = ['ROUND', 'OVAL', 'PEAR', 'EMERALD', 'PRINCESS', 'CUSHION'];

// In the POST /api/diamonds endpoint
app.post('/api/diamonds', async (req, res) => {
    try {
        const newDiamond = req.body;

        // Validate required fields but skip shape validation
        if (!newDiamond.SHAPE || newDiamond.MM === undefined || typeof newDiamond['PRICE/CT'] !== 'number') {
            return res.status(400).json({
                error: { message: 'Invalid input: SHAPE, MM, and PRICE/CT are required, and PRICE/CT must be a number' }
            });
        }

        // Validate MM for ROUND shape
        if (newDiamond.SHAPE === 'ROUND' && typeof newDiamond.MM !== 'number') {
            return res.status(400).json({
                error: { message: 'MM must be a number for ROUND shape' }
            });
        }

        const snapshot = await db.collection('diamonds').get();
        const maxId = snapshot.empty ? 0 : Math.max(...snapshot.docs.map(doc => parseInt(doc.id)));
        newDiamond.id = maxId + 1;
        newDiamond['MM & SHAPE'] = `${newDiamond.SHAPE}-${newDiamond.MM} MM`;

        await db.collection('diamonds').doc(newDiamond.id.toString()).set(sanitizeData(newDiamond));
        res.status(201).json(newDiamond);
    } catch (err) {
        console.error('Error adding diamond:', err);
        res.status(500).json({ error: { message: 'Failed to add diamond' } });
    }
});

// In the PUT /api/diamonds/:id endpoint
// Helper function to normalize MM values for comparison


// Updated PUT /api/diamonds/:id endpoint
// Helper function to normalize MM values for comparison
// Helper function to normalize MM values for comparison
// Helper function to normalize MM values for comparison
// Helper function to normalize MM values for comparison
// Helper function to normalize MM values for comparison
// Helper function to normalize MM values for comparison
function normalizeMM(mm) {
    if (typeof mm === 'string') {
        const parts = mm.split('x').map(part => parseFloat(part.trim()).toFixed(2));
        return parts.length > 1 ? parts.join(' x ') : parts[0];
    }
    return parseFloat(mm).toFixed(2);
}

// Helper function to sanitize data
function sanitizeData(obj) {
    if (obj === null || obj === undefined) return null;
    if (Array.isArray(obj)) return obj.map(item => sanitizeData(item));
    if (typeof obj !== 'object' || obj instanceof Date) return obj;
    
    const result = {};
    for (const [key, value] of Object.entries(obj)) {
        if (value === undefined || value === null) {
            result[key] = null;
        } else if (typeof value === 'object' && !(value instanceof Date)) {
            result[key] = sanitizeData(value);
        } else if (typeof value !== 'function' && !Number.isNaN(value)) {
            result[key] = value;
        }
    }
    return result;
}
async function updateDiamondAndRefresh(id, diamondData) {
    await fetch(`/api/diamonds/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(diamondData)
    });

    // Wait briefly to ensure Firestore updates propagate
    await new Promise(resolve => setTimeout(resolve, 1000));

    const response = await fetch('/api/metadata', {
        headers: { 'Cache-Control': 'no-cache' }
    });
    const metadata = await response.json();
    // Update UI with metadata
}
app.put('/api/diamonds/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const updatedDiamond = req.body;

        // Normalize and validate input
        updatedDiamond.SHAPE = updatedDiamond.SHAPE?.trim().toUpperCase();
        if (!updatedDiamond.SHAPE || updatedDiamond.MM === undefined || typeof updatedDiamond['PRICE/CT'] !== 'number') {
            return res.status(400).json({
                error: { message: 'Invalid input: SHAPE, MM, and PRICE/CT are required, and PRICE/CT must be a number' }
            });
        }

        const diamondData = {
            id: parseInt(id),
            SHAPE: updatedDiamond.SHAPE,
            MM: updatedDiamond.MM,
            'PRICE/CT': parseFloat(updatedDiamond['PRICE/CT']).toFixed(2),
            'MM & SHAPE': `${updatedDiamond.SHAPE}-${updatedDiamond.MM} MM`
        };

        let batchUpdates = [];

        const result = await db.runTransaction(async (transaction) => {
            const diamondRef = db.collection('diamonds').doc(id);
            const diamondDoc = await transaction.get(diamondRef);
            if (!diamondDoc.exists) {
                throw new Error('Diamond not found');
            }

            const metadataSnapshot = await transaction.get(db.collection('metadata'));
            const metadataDocs = metadataSnapshot.docs.filter(doc => !doc.data().storedInCloudStorage);

            const metadataWithSubcollections = [];
            for (const doc of metadataDocs) {
                const diamondItemsSnapshot = await transaction.get(
                    db.collection('metadata').doc(doc.id).collection('diamondItems')
                );
                const metalSummarySnapshot = await transaction.get(
                    db.collection('metadata').doc(doc.id).collection('metalSummary')
                );
                console.log(`Pre-transaction: metalSummary docs in ${doc.id}:`, metalSummarySnapshot.docs.map(d => d.id));
                metadataWithSubcollections.push({
                    doc,
                    diamondItems: diamondItemsSnapshot.docs.map(d => ({ id: d.id, ...d.data() })),
                    metalSummaries: metalSummarySnapshot.docs.map(d => ({ id: d.id, ...d.data() }))
                });
            }

            transaction.set(diamondRef, sanitizeData(diamondData));
            console.log(`Diamond document ${id} set in transaction`);

            let writeCount = 1;

            for (const { doc, diamondItems, metalSummaries } of metadataWithSubcollections) {
                const quotation = doc.data();
                console.log(`Processing Firestore metadata document ${doc.id}`);

                let metadataUpdated = false;
                let totalDiamondAmount = 0;
                const updatedDiamondItems = diamondItems.map(item => {
                    if (
                        item.shape &&
                        item.mm &&
                        item.totalWeightCt &&
                        item.shape.toUpperCase() === diamondData.SHAPE &&
                        normalizeMM(item.mm) === normalizeMM(diamondData.MM)
                    ) {
                        console.log(`Matching diamondItem ${item.id} in metadata ${doc.id}`);
                        const newPricePerCt = parseFloat(diamondData['PRICE/CT']).toFixed(2);
                        const newTotal = (parseFloat(item.totalWeightCt) * parseFloat(newPricePerCt)).toFixed(2);
                        metadataUpdated = true;
                        return { ...item, pricePerCt: newPricePerCt, total: newTotal };
                    }
                    return item;
                });

                totalDiamondAmount = updatedDiamondItems
                    .reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0)
                    .toFixed(2);
                console.log(`Calculated totalDiamondAmount for metadata ${doc.id}: ${totalDiamondAmount}`);

                if (metadataUpdated) {
                    updatedDiamondItems.forEach(item => {
                        const itemRef = db.collection('metadata').doc(doc.id).collection('diamondItems').doc(item.id);
                        console.log(`Setting diamondItem ${item.id} in metadata ${doc.id}:`, item);
                        transaction.set(itemRef, sanitizeData(item));
                        batchUpdates.push(`diamondItem ${item.id} in metadata ${doc.id}`);
                        writeCount++;
                    });

                    // Original lines for updating only summary.totalDiamondAmount (previously 381-385) are removed.
                    // We first calculate updatedMetalSummaries, then update the main document's summary comprehensively.

                    const updatedMetalSummaries = metalSummaries.map(summary => {
                        const newTotal = (
                            parseFloat(summary.totalMetal || 0) +
                            parseFloat(summary.makingCharges || 0) +
                            parseFloat(totalDiamondAmount) // totalDiamondAmount for the entire quotation
                        ).toFixed(2);
                        console.log(`Preparing metalSummary ${summary.id} in metadata ${doc.id}: totalDiamondAmount=${totalDiamondAmount}, total=${newTotal}`);
                        return {
                            ...summary, // Spread existing fields from the subcollection item
                            totalDiamondAmount: totalDiamondAmount, // This is the overall totalDiamondAmount
                            total: newTotal,
                            updatedAt: new Date().toISOString()
                        };
                    });

                    // Update main metadata document's summary (totalDiamondAmount and metalSummary array)
                    const mainDocUpdates = {
                        'summary.totalDiamondAmount': totalDiamondAmount,
                        'summary.metalSummary': updatedMetalSummaries.map(s => {
                            const { id, ...summaryData } = s; // Remove 'id' property from subcollection item for the array
                            return sanitizeData(summaryData);
                        })
                    };
                    transaction.update(db.collection('metadata').doc(doc.id), mainDocUpdates);
                    batchUpdates.push(`summary in metadata ${doc.id} (totalDiamondAmount and metalSummary array) updated`);
                    writeCount++; // Counts as one update operation for the main document

                    updatedMetalSummaries.forEach(summary => {
                        if (!summary.totalDiamondAmount || !summary.total) {
                            console.error(`Invalid metalSummary ${summary.id} in metadata ${doc.id}:`, summary);
                            throw new Error(`Invalid metalSummary ${summary.id} in metadata ${doc.id}`);
                        }
                        const summaryRef = db.collection('metadata').doc(doc.id).collection('metalSummary').doc(summary.id);
                        console.log(`Setting metalSummary ${summary.id} in metadata ${doc.id}:`, summary);
                        transaction.set(summaryRef, sanitizeData(summary));
                        batchUpdates.push(`metalSummary ${summary.id} in metadata ${doc.id}`);
                        writeCount++;
                    });
                }

                console.log(`Write count for metadata ${doc.id}: ${writeCount}`);
            }

            console.log(`Total writes in transaction: ${writeCount}`);
            return { diamondData, batchUpdates };
        });

        // Handle Cloud Storage updates
        const cloudUpdates = [];
        const metadataCloudSnapshot = await db.collection('metadata')
            .where('storedInCloudStorage', '==', true)
            .get();

        for (const doc of metadataCloudSnapshot.docs) {
            const quotation = doc.data();
            if (!quotation.storagePath) {
                console.warn(`No storagePath for metadata ${doc.id}, skipping`);
                continue;
            }

            try {
                console.log(`Processing Cloud Storage metadata ${doc.id}`);
                const file = bucket.file(quotation.storagePath);
                const [contents] = await file.download();
                let metadata = JSON.parse(contents.toString());

                let metadataUpdated = false;
                let totalDiamondAmount = 0;
                const updatedDiamondItems = metadata.diamondItems.map(item => {
                    if (
                        item.shape &&
                        item.mm &&
                        item.totalWeightCt &&
                        item.shape.toUpperCase() === diamondData.SHAPE &&
                        normalizeMM(item.mm) === normalizeMM(diamondData.MM)
                    ) {
                        const newPricePerCt = parseFloat(diamondData['PRICE/CT']).toFixed(2);
                        const newTotal = (parseFloat(item.totalWeightCt) * parseFloat(newPricePerCt)).toFixed(2);
                        metadataUpdated = true;
                        return { ...item, pricePerCt: newPricePerCt, total: newTotal };
                    }
                    return item;
                });
                metadata.diamondItems = updatedDiamondItems;

                totalDiamondAmount = updatedDiamondItems
                    .reduce((sum, item) => sum + (parseFloat(item.total) || 0), 0)
                    .toFixed(2);

                if (metadataUpdated) {
                    metadata.summary.totalDiamondAmount = totalDiamondAmount;
                    metadata.summary.metalSummary = metadata.summary.metalSummary.map(summary => {
                        const newTotal = (
                            parseFloat(summary.totalMetal || 0) +
                            parseFloat(summary.makingCharges || 0) +
                            parseFloat(totalDiamondAmount)
                        ).toFixed(2);
                        return {
                            ...summary,
                            totalDiamondAmount: totalDiamondAmount,
                            total: newTotal,
                            updatedAt: new Date().toISOString()
                        };
                    });

                    await bucket.file(quotation.storagePath).save(JSON.stringify(metadata), {
                        contentType: 'application/json'
                    });
                    cloudUpdates.push({
                        ref: db.collection('metadata').doc(doc.id),
                        data: { 'summary.totalDiamondAmount': totalDiamondAmount }
                    });
                }
            } catch (storageErr) {
                console.error(`Error processing Cloud Storage metadata ${doc.id}:`, storageErr);
            }
        }

        if (cloudUpdates.length > 0) {
            const batch = db.batch();
            cloudUpdates.forEach(update => {
                batch.update(update.ref, update.data);
            });
            await batch.commit();
        }

        // Verify updates with additional logging
        for (const update of result.batchUpdates) {
            if (update.includes('metalSummary')) {
                const [_, itemId, , , metadataId] = update.split(' ');
                const summaryRef = db.collection('metadata').doc(metadataId).collection('metalSummary').doc(itemId);
                const summaryDoc = await summaryRef.get();
                if (summaryDoc.exists) {
                    console.log(`Verified metalSummary ${itemId} in ${metadataId}:`, summaryDoc.data());
                } else {
                    console.error(`Verification failed: metalSummary ${itemId} in ${metadataId} not found`);
                }
            }
        }

        res.json({
            diamond: result.diamondData,
            updatedMetadata: result.batchUpdates,
            updatedCloudMetadata: cloudUpdates.map(update => update.ref.id)
        });
    } catch (err) {
        console.error('Error updating diamond:', err.stack);
        if (err.message === 'Diamond not found') {
            return res.status(404).json({ error: { message: 'Diamond not found' } });
        }
        if (err.code === 8 && err.message.includes('Quota exceeded')) {
            return res.status(429).json({ error: { message: 'Firestore quota exceeded. Please try again later or upgrade your plan.' } });
        }
        return res.status(500).json({ error: { message: 'Failed to update diamond', details: err.message, stack: err.stack } });
    }
});
// Delete a diamond
app.delete('/api/diamonds/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const diamondRef = db.collection('diamonds').doc(id);
        const diamondDoc = await diamondRef.get();
        if (!diamondDoc.exists) {
            return res.status(404).json({ error: { message: 'Diamond not found' } });
        }

        await diamondRef.delete();
        res.json({ message: 'Diamond deleted successfully' });
    } catch (err) {
        console.error('Error deleting diamond:', err);
        res.status(500).json({ error: { message: 'Failed to delete diamond' } });
    }
});

// Get all quotations
app.get('/api/metadata', async (req, res) => {
    res.set('Cache-Control', 'no-cache');
    try {
        const snapshot = await db.collection('metadata').get();
        const metadata = [];
        for (const doc of snapshot.docs) {
            const data = doc.data();
            if (data.storedInCloudStorage) {
                try {
                    const file = bucket.file(data.storagePath);
                    const [contents] = await file.download();
                    metadata.push(JSON.parse(contents.toString()));
                } catch (storageErr) {
                    console.error(`Error downloading quotation ${doc.id} from Cloud Storage:`, storageErr);
                    continue;
                }
            } else {
                // Fetch subcollections with consistent reads
                const [diamondItemsSnapshot, metalItemsSnapshot, metalSummarySnapshot] = await Promise.all([
                    db.collection('metadata').doc(doc.id).collection('diamondItems').get(),
                    db.collection('metadata').doc(doc.id).collection('metalItems').get(),
                    db.collection('metadata').doc(doc.id).collection('metalSummary').get()
                ]);
                data.diamondItems = diamondItemsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                data.metalItems = metalItemsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                data.summary.metalSummary = metalSummarySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                metadata.push(data);
            }
        }
        res.json(metadata);
    } catch (err) {
        console.error('Error fetching metadata:', err);
        res.status(500).json({ error: { message: 'Failed to load metadata', details: err.message } });
    }
});

// Delete a quotation
app.delete('/api/metadata/:id', async (req, res) => {
    try {
        const id = req.params.id;
        const docRef = db.collection('metadata').doc(id);
        const doc = await docRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: { message: 'Quotation not found' } });
        }

        const quotationData = doc.data();

        // Delete images from GitHub if they exist
        if (quotationData.identification && Array.isArray(quotationData.identification.images)) {
            const deleteImagePromises = quotationData.identification.images.map(async (url) => {
                if (!url.startsWith(`https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/`)) {
                    console.warn(`Invalid GitHub URL for image: ${url}`);
                    return;
                }

                try {
                    // Extract file path from URL
                    const filePath = url.split(`https://raw.githubusercontent.com/${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}/main/`)[1];

                    // Get the file's SHA
                    const { data } = await octokit.repos.getContent({
                        owner: process.env.GITHUB_OWNER,
                        repo: process.env.GITHUB_REPO,
                        path: filePath
                    });

                    // Delete the file from GitHub
                    await octokit.repos.deleteFile({
                        owner: process.env.GITHUB_OWNER,
                        repo: process.env.GITHUB_REPO,
                        path: filePath,
                        message: `Delete image ${filePath} associated with quotation ${id}`,
                        sha: data.sha,
                        branch: 'main'
                    });
                } catch (err) {
                    console.error(`Error deleting image ${url} from GitHub:`, err);
                }
            });

            // Wait for all image deletions to complete
            await Promise.all(deleteImagePromises);
        }

        // Delete subcollections
        const subcollections = ['diamondItems', 'metalItems', 'metalSummary'];
        for (const subcollection of subcollections) {
            const snapshot = await db.collection('metadata').doc(id).collection(subcollection).get();
            const batch = db.batch();
            snapshot.docs.forEach(doc => batch.delete(doc.ref));
            await batch.commit();
        }

        // Delete the main quotation document
        await docRef.delete();
        res.json({ message: 'Quotation and associated images deleted successfully' });
    } catch (err) {
        console.error('Error deleting quotation or images:', err);
        res.status(500).json({ error: { message: 'Failed to delete quotation or images', details: err.message } });
    }
});

// Save a quotation
app.post('/api/save-quotation', async (req, res) => {
    const newQuotation = req.body;

    // Validate required fields
    if (!newQuotation.quotationId || !newQuotation.metalItems || !newQuotation.summary) {
        console.error('Validation failed: Missing quotationId, metalItems, or summary');
        return res.status(400).json({ 
            error: { message: 'Invalid quotation: quotationId, metalItems, and summary are required' }
        });
    }

    // Validate metalSummary
    if (!Array.isArray(newQuotation.summary.metalSummary) || newQuotation.summary.metalSummary.length === 0) {
        console.error('Validation failed: metalSummary is empty or not an array');
        return res.status(400).json({ 
            error: { message: 'Invalid quotation: At least one metalSummary item is required' }
        });
    }

    try {
        const docId = newQuotation.quotationId.toString();
        const docRef = db.collection('metadata').doc(docId);

        const doc = await docRef.get();
        if (doc.exists) {
            console.error(`Quotation ${docId} already exists`);
            return res.status(400).json({ error: { message: `Quotation ${docId} already exists` } });
        }

        // Normalize diamondItems shapes
        if (Array.isArray(newQuotation.diamondItems)) {
            newQuotation.diamondItems.forEach(item => {
                if (item.shape) {
                    item.shape = item.shape.trim().toUpperCase();
                }
            });
        }

        // Prepare main document for Firestore
        const mainDoc = sanitizeData({
            quotationId: newQuotation.quotationId,
            identification: {
                idSku: newQuotation.identification.idSku,
                category: newQuotation.identification.category,
                images: newQuotation.identification.images
            },
            quotationDate: newQuotation.quotationDate ? new Date(newQuotation.quotationDate) : null,
            summary: {
                idSku: newQuotation.summary.idSku,
                category: newQuotation.summary.category,
                totalDiamondAmount: newQuotation.summary.totalDiamondAmount,
                metalSummary: newQuotation.summary.metalSummary // Include metalSummary
            }
        });

        const mainDocSize = getDocumentSize(mainDoc);
        if (mainDocSize > 1_000_000) {
            console.warn(`Quotation ${docId} exceeds 1 MB. Storing in Cloud Storage.`);
            const storagePath = `quotations/${docId}.json`;
            // Ensure metalSummary is included in Cloud Storage
            const cloudData = {
                ...newQuotation,
                summary: {
                    ...newQuotation.summary,
                    metalSummary: newQuotation.summary.metalSummary
                }
            };
            await bucket.file(storagePath).save(JSON.stringify(cloudData), {
                contentType: 'application/json'
            });
            await docRef.set({
                quotationId: docId,
                storagePath,
                storedInCloudStorage: true
            });
            return res.status(200).json({ message: `Quotation ${docId} saved in Cloud Storage` });
        }

        // Save main document to Firestore
        await docRef.set(mainDoc);

        // Save metalItems subcollection
        if (Array.isArray(newQuotation.metalItems) && newQuotation.metalItems.length > 0) {
            const batch = db.batch();
            newQuotation.metalItems.forEach((item, index) => {
                if (!item.purity || !item.grams || !item.ratePerGram) {
                    console.warn(`Invalid metalItem at index ${index}:`, item);
                    return;
                }
                const itemRef = docRef.collection('metalItems').doc(`item_${index}`);
                batch.set(itemRef, sanitizeData(item));
            });
            await batch.commit();
        }

        // Save diamondItems subcollection
        if (Array.isArray(newQuotation.diamondItems) && newQuotation.diamondItems.length > 0) {
            const batch = db.batch();
            newQuotation.diamondItems.forEach((item, index) => {
                if (!item.shape || !item.mm || !item.pricePerCt || !item.totalWeightCt) {
                    console.warn(`Invalid diamondItem at index ${index}:`, item);
                    return;
                }
                const itemRef = docRef.collection('diamondItems').doc(`item_${index}`);
                batch.set(itemRef, sanitizeData(item));
            });
            await batch.commit();
        }

        // Save metalSummary subcollection
        if (Array.isArray(newQuotation.summary.metalSummary) && newQuotation.summary.metalSummary.length > 0) {
            const batch = db.batch();
            newQuotation.summary.metalSummary.forEach((item, index) => {
                if (!item.purity || !item.grams || !item.ratePerGram) {
                    console.warn(`Invalid metalSummary item at index ${index}:`, item);
                    return;
                }
                const itemRef = docRef.collection('metalSummary').doc(`item_${index}`);
                batch.set(itemRef, sanitizeData(item));
            });
            await batch.commit();
        }

        return res.status(200).json({ message: `Quotation ${docId} saved successfully` });
    } catch (err) {
        console.error('Error saving quotation:', err);
        return res.status(500).json({ error: { message: 'Failed to save quotation', details: err.message } });
    }
});

// Get metal prices
app.get('/api/prices', async (req, res) => {
    try {
        const doc = await db.collection('metalPrices').doc('prices').get();
        if (!doc.exists) {
            return res.status(404).json({ error: { message: 'Prices not found' } });
        }
        res.json(doc.data());
    } catch (err) {
        console.error('Error fetching prices:', err);
        res.status(500).json({ error: { message: 'Error reading prices', details: err.message } });
    }
});

// Update metal prices
// Update metal prices
app.post('/api/prices', async (req, res) => {
    try {
        const newPrices = req.body;

        if (!newPrices || typeof newPrices !== 'object') {
            return res.status(400).json({
                error: { message: 'Invalid input: newPrices must be an object' }
            });
        }

        // Save new prices
        await db.collection('metalPrices').doc('prices').set(sanitizeData(newPrices));

        // Use a transaction to update metadata atomically
        await db.runTransaction(async (transaction) => {
            const metadataSnapshot = await transaction.get(db.collection('metadata'));
            const metadataDocsToUpdate = metadataSnapshot.docs.filter(doc => !doc.data().storedInCloudStorage);

            const allReads = [];
            for (const doc of metadataDocsToUpdate) {
                allReads.push(
                    transaction.get(db.collection('metadata').doc(doc.id).collection('metalItems')),
                    transaction.get(db.collection('metadata').doc(doc.id).collection('metalSummary'))
                );
            }

            const allSnapshots = await Promise.all(allReads);
            let snapshotIndex = 0;

            const updatesToWrite = [];

            for (const doc of metadataDocsToUpdate) {
                const quotation = doc.data(); // Original quotation data from the first read
                console.log(`Processing metadata ${doc.id} for price update (read phase complete)`);

                const metalItemsSnapshot = allSnapshots[snapshotIndex++];
                const metalSummarySnapshot = allSnapshots[snapshotIndex++];

                const metalItems = metalItemsSnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                const updatedMetalItems = metalItems.map(metal => {
                    const newRate = newPrices[metal.purity];
                    if (newRate === undefined) { // Check for undefined explicitly
                        console.error(`Price for purity ${metal.purity} not found in newPrices for metalItem ${metal.id} in ${doc.id}. Available prices:`, newPrices);
                        throw new Error(`Price for ${metal.purity} not found in metalPrice`);
                    }
                    const newTotalMetal = (parseFloat(metal.grams) * parseFloat(newRate)).toFixed(2);
                    const newTotal = (
                        parseFloat(newTotalMetal) +
                        parseFloat(metal.makingCharges || 0)
                    ).toFixed(2);
                    return {
                        ...metal,
                        ratePerGram: parseFloat(newRate).toFixed(2),
                        totalMetal: newTotalMetal,
                        total: newTotal
                    };
                });

                updatedMetalItems.forEach(metal => {
                    updatesToWrite.push({
                        ref: db.collection('metadata').doc(doc.id).collection('metalItems').doc(metal.id),
                        data: sanitizeData(metal)
                    });
                });

                const metalSummaries = metalSummarySnapshot.docs.map(d => ({ id: d.id, ...d.data() }));
                const updatedMetalSummaries = metalSummaries.map(summary => {
                    const newRate = newPrices[summary.purity];
                    if (newRate === undefined) { // Check for undefined explicitly
                        console.error(`Price for purity ${summary.purity} not found in newPrices for metalSummary ${summary.id} in ${doc.id}. Available prices:`, newPrices);
                        throw new Error(`Price for ${summary.purity} not found in metalPrice`);
                    }
                    const newTotalMetal = (parseFloat(summary.grams) * parseFloat(newRate)).toFixed(2);
                    const newTotal = (
                        parseFloat(newTotalMetal) +
                        parseFloat(summary.makingCharges || 0) +
                        parseFloat(summary.totalDiamondAmount || 0)
                    ).toFixed(2);
                    return {
                        ...summary,
                        ratePerGram: parseFloat(newRate).toFixed(2),
                        totalMetal: newTotalMetal,
                        total: newTotal,
                        updatedAt: new Date().toISOString()
                    };
                });

                updatedMetalSummaries.forEach(summary => {
                    updatesToWrite.push({
                        ref: db.collection('metadata').doc(doc.id).collection('metalSummary').doc(summary.id),
                        data: sanitizeData(summary)
                    });
                });
                
                // Prepare the main metadata document update.
                // It needs to reflect the changes in its metalSummary array if it's stored directly.
                const mainDocData = { ...quotation }; // Start with existing data
                if (mainDocData.summary && Array.isArray(mainDocData.summary.metalSummary)) {
                    mainDocData.summary.metalSummary = updatedMetalSummaries.map(s => {
                        const { id, ...summaryData } = s; // Remove 'id' if it's from subcollection
                        return sanitizeData(summaryData);
                    });
                }
                // If other fields in the main doc depend on these prices, update them here.
                // For now, we are just updating the metalSummary array within the summary.

                updatesToWrite.push({
                    ref: db.collection('metadata').doc(doc.id),
                    data: sanitizeData(mainDocData) // Use the potentially modified mainDocData
                });
            }

            // Perform all writes
            updatesToWrite.forEach(update => {
                console.log(`Writing to ${update.ref.path}:`, update.data);
                transaction.set(update.ref, update.data);
            });
        });

        res.json({ message: 'Prices and metadata updated successfully' });
    } catch (err) {
        console.error('Error updating prices and metadata:', err);
        res.status(500).json({ error: { message: 'Error updating prices and metadata', details: err.message } });
    }
});

// Serve frontend
app.get(/^(?!\/api).*/, (req, res) => {
    if (req.accepts('html')) {
        res.sendFile(path.join(__dirname, 'public', 'index.html'));
        return;
    }
    res.status(404).json({ error: { message: 'Resource not found' } });
});

// Start the server
app.listen(PORT, async () => {
    try {
        console.log(`Server is running on http://localhost:${PORT}`);
    } catch (err) {
        console.error('Failed to start server:', err);
        process.exit(1);
    }
});